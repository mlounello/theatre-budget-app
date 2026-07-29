import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import { getAccessContext } from "@/lib/access";
import { decryptSensitiveValue } from "@/lib/sensitive-encryption";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function fillText(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string, multiline = false): void {
  const field = form.getFieldMaybe(name);
  if (field instanceof PDFTextField) {
    if (multiline) field.enableMultiline();
    field.setText(value);
  }
}

function check(form: ReturnType<PDFDocument["getForm"]>, name: string): void {
  const field = form.getFieldMaybe(name);
  if (field instanceof PDFCheckBox) field.check();
}

function date(value: string | null): string {
  if (!value) return new Date().toLocaleDateString("en-US");
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "union-fund";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contractId: string; contributionId: string }> }
) {
  const access = await getAccessContext();
  if (!access.userId) return NextResponse.redirect(new URL("/login", request.url));
  if (!["admin", "project_manager"].includes(access.role)) return new NextResponse("Forbidden", { status: 403 });
  const { contractId, contributionId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("contract_union_contributions")
    .select(
      "id, contract_id, fund_name_snapshot, vendor_number_snapshot, foapal_id_snapshot, check_request_handling_snapshot, check_request_other_location_snapshot, vendor_address1_snapshot, vendor_address2_snapshot, vendor_address3_snapshot, tax_id_encrypted_snapshot, amount, mail_by, ap_receive_by, due_date, contracts!inner(id, project_id, contract_number, contract_role, contractor_name, accounting_project:projects!contracts_project_id_fkey(name, season), organization:organizations!contracts_organization_id_fkey(org_code), account_code:account_codes!contracts_banner_account_code_id_fkey(code))"
    )
    .eq("id", contributionId)
    .eq("contract_id", contractId)
    .single();
  if (error || !data) return new NextResponse("Union contribution not found.", { status: 404 });
  const joined = data.contracts as {
    project_id?: string;
    contract_number?: string | null;
    contract_role?: string | null;
    contractor_name?: string | null;
    accounting_project?: { name?: string | null; season?: string | null } | null;
    organization?: { org_code?: string | null } | null;
    account_code?: { code?: string | null } | null;
  } | null;
  const projectId = joined?.project_id ?? "";
  if (access.role !== "admin" && !access.manageableProjectIds.has(projectId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const template = await readFile(path.join(process.cwd(), "public", "templates", "check-request.pdf"));
  const pdf = await PDFDocument.load(template);
  const form = pdf.getForm();
  let fundCode = "";
  let orgCode = joined?.organization?.org_code ?? "";
  let programCode = "";
  if (data.foapal_id_snapshot) {
    const { data: foapal } = await supabase
      .from("foapals")
      .select("funds(code), organizations(org_code), programs(code)")
      .eq("id", data.foapal_id_snapshot as string)
      .maybeSingle();
    fundCode = (foapal?.funds as { code?: string } | null)?.code ?? "";
    orgCode = (foapal?.organizations as { org_code?: string } | null)?.org_code ?? orgCode;
    programCode = (foapal?.programs as { code?: string } | null)?.code ?? "";
  }
  let taxId = "";
  try {
    taxId = data.tax_id_encrypted_snapshot
      ? decryptSensitiveValue(data.tax_id_encrypted_snapshot as string)
      : "";
  } catch {
    return new NextResponse("Union fund Tax ID could not be decrypted.", { status: 500 });
  }
  const fundName = data.fund_name_snapshot as string;
  const projectName = joined?.accounting_project?.name ?? "Project";
  const description = `Union fund contribution for ${joined?.contractor_name ?? "artist"} — ${projectName}${joined?.contract_role ? ` — ${joined.contract_role}` : ""}${joined?.contract_number ? ` — Contract #${joined.contract_number}` : ""}`;
  fillText(form, "VendorName", fundName);
  fillText(form, "Date", date((data.mail_by as string | null) ?? (data.ap_receive_by as string | null) ?? (data.due_date as string | null)));
  fillText(form, "VendorNumber", (data.vendor_number_snapshot as string | null) ?? "");
  fillText(form, "TaxOrSSN", taxId);
  fillText(form, "VendorAddress1", (data.vendor_address1_snapshot as string | null) ?? "");
  fillText(form, "VendorAddress2", (data.vendor_address2_snapshot as string | null) ?? "");
  fillText(form, "VendorAddress3", (data.vendor_address3_snapshot as string | null) ?? "");
  fillText(form, "FND1", fundCode);
  fillText(form, "ORG1", orgCode);
  fillText(form, "ACT1", joined?.account_code?.code ?? "");
  fillText(form, "PRG1", programCode);
  fillText(form, "Amount1", money(data.amount));
  fillText(form, "Description", description, true);
  const handling = String(data.check_request_handling_snapshot ?? "mail");
  if (handling === "business_affairs_pickup") check(form, "BusAffairsChq");
  else if (handling === "other") {
    check(form, "OtherChq");
    fillText(form, "OtherLocation", (data.check_request_other_location_snapshot as string | null) ?? "");
  } else check(form, "MailChq");

  form.flatten();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const firstPage = pdf.getPages()[0];
  const notice = "MUST BE SEPARATE CHECK";
  const size = 16;
  const width = bold.widthOfTextAtSize(notice, size);
  firstPage.drawText(notice, {
    x: Math.max(20, (firstPage.getWidth() - width) / 2),
    y: firstPage.getHeight() - 22,
    size,
    font: bold,
    color: rgb(0.85, 0, 0)
  });
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName(fundName)}-separate-check-request.pdf"`,
      "Cache-Control": "no-store"
    }
  });
}
