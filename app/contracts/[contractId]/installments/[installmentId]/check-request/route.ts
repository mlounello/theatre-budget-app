import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { getAccessContext } from "@/lib/access";
import { decryptSensitiveValue } from "@/lib/sensitive-encryption";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    contractId: string;
    installmentId: string;
  }>;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return new Date().toLocaleDateString("en-US");
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function formatMoney(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "check-request";
}

function fillText(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, value: string): void {
  const field = form.getFieldMaybe(fieldName);
  if (field instanceof PDFTextField) {
    field.setText(value);
  }
}

function checkBox(form: ReturnType<PDFDocument["getForm"]>, fieldName: string): void {
  const field = form.getFieldMaybe(fieldName);
  if (field instanceof PDFCheckBox) {
    field.check();
  }
}

function buildDescription(params: {
  contractNumber: string | null;
  installmentNumber: number;
  contractorName: string;
  projectName: string;
  season: string | null;
  role: string | null;
}): string {
  const contractPart = params.contractNumber ? `Contract #${params.contractNumber}` : "Contract";
  const productionPart = [params.projectName, params.season, params.role].filter(Boolean).join(", ");
  return `${contractPart} payment #${params.installmentNumber} for ${params.contractorName} - ${productionPart}`;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const access = await getAccessContext();
  if (!access.userId) return NextResponse.redirect(new URL("/login", _request.url));
  if (!["admin", "project_manager"].includes(access.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { contractId, installmentId } = await params;
  const supabase = await getSupabaseServerClient();

  let { data, error } = await supabase
    .from("contract_installments")
    .select(
      "id, contract_id, installment_number, installment_amount, due_date, ap_receive_by, mail_by, check_request_foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_encrypted, contracts!inner(id, project_id, organization_id, banner_account_code_id, contractor_name, contractor_employee_id, contract_number, contract_role, check_request_foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_encrypted, notes, projects(name, season), organizations(org_code, name), account_codes(code, name))"
    )
    .eq("id", installmentId)
    .eq("contract_id", contractId)
    .single();
  if (error && error.message.toLowerCase().includes("due_date")) {
    ({ data, error } = await supabase
      .from("contract_installments")
      .select(
        "id, contract_id, installment_number, installment_amount, contracts!inner(id, project_id, organization_id, banner_account_code_id, contractor_name, contractor_employee_id, notes, projects(name, season), organizations(org_code, name), account_codes(code, name))"
      )
      .eq("id", installmentId)
      .eq("contract_id", contractId)
      .single());
  }
  if (error || !data) {
    return new NextResponse("Check request installment not found.", { status: 404 });
  }

  const contractJoin = data.contracts as
    | {
        id?: string;
        project_id?: string;
        organization_id?: string | null;
        banner_account_code_id?: string | null;
        contractor_name?: string | null;
        contractor_employee_id?: string | null;
        contract_number?: string | null;
        contract_role?: string | null;
        check_request_foapal_id?: string | null;
        check_request_handling?: string | null;
        check_request_other_location?: string | null;
        vendor_address1?: string | null;
        vendor_address2?: string | null;
        vendor_address3?: string | null;
        tax_id_encrypted?: string | null;
        notes?: string | null;
        projects?: { name?: string | null; season?: string | null } | null;
        organizations?: { org_code?: string | null; name?: string | null } | null;
        account_codes?: { code?: string | null; name?: string | null } | null;
      }
    | null;
  const projectId = contractJoin?.project_id ?? "";
  if (access.role !== "admin" && !access.manageableProjectIds.has(projectId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const templatePath = path.join(process.cwd(), "public", "templates", "check-request.pdf");
  let templateBytes: Buffer;
  try {
    templateBytes = await readFile(templatePath);
  } catch {
    return new NextResponse("Check request template file is missing. Please contact an administrator.", { status: 500 });
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const contractorName = contractJoin?.contractor_name ?? "Contractor";
  const installmentNumber = Number(data.installment_number ?? 1);
  const amount = data.installment_amount as string | number | null;
  const projectName = contractJoin?.projects?.name ?? "Project";
  const season = contractJoin?.projects?.season ?? null;
  let orgCode = contractJoin?.organizations?.org_code ?? "";
  let fundCode = "";
  let programCode = "";
  const accountCode = contractJoin?.account_codes?.code ?? "";
  const submissionDate = (data.mail_by as string | null) ?? (data.ap_receive_by as string | null) ?? null;
  const foapalId = ((data.check_request_foapal_id as string | null) ?? contractJoin?.check_request_foapal_id ?? "").trim();
  if (foapalId) {
    const { data: foapal } = await supabase
      .from("foapals")
      .select("funds(code), organizations(org_code), programs(code)")
      .eq("id", foapalId)
      .maybeSingle();
    const fund = foapal?.funds as { code?: string | null } | null | undefined;
    const organization = foapal?.organizations as { org_code?: string | null } | null | undefined;
    const program = foapal?.programs as { code?: string | null } | null | undefined;
    fundCode = fund?.code ?? "";
    orgCode = organization?.org_code ?? orgCode;
    programCode = program?.code ?? "";
  }
  const handling = ((data.check_request_handling as string | null) ?? contractJoin?.check_request_handling ?? "mail") as
    | "mail"
    | "business_affairs_pickup"
    | "other";
  const otherLocation = (data.check_request_other_location as string | null) ?? contractJoin?.check_request_other_location ?? "";
  const encryptedTaxId = (data.tax_id_encrypted as string | null) ?? contractJoin?.tax_id_encrypted ?? null;
  let taxIdOrSsn = "";
  if (encryptedTaxId) {
    try {
      taxIdOrSsn = decryptSensitiveValue(encryptedTaxId);
    } catch {
      return new NextResponse("Tax ID/SSN could not be decrypted. Please contact an administrator.", { status: 500 });
    }
  }
  const description = buildDescription({
    contractNumber: contractJoin?.contract_number ?? null,
    installmentNumber,
    contractorName,
    projectName,
    season,
    role: contractJoin?.contract_role ?? null
  });

  fillText(form, "VendorName", contractorName);
  fillText(form, "Date", formatDate(submissionDate));
  fillText(form, "VendorNumber", contractJoin?.contractor_employee_id ?? "");
  fillText(form, "TaxOrSSN", taxIdOrSsn);
  fillText(form, "VendorAddress1", (data.vendor_address1 as string | null) ?? contractJoin?.vendor_address1 ?? "");
  fillText(form, "VendorAddress2", (data.vendor_address2 as string | null) ?? contractJoin?.vendor_address2 ?? "");
  fillText(form, "VendorAddress3", (data.vendor_address3 as string | null) ?? contractJoin?.vendor_address3 ?? "");
  fillText(form, "FND1", fundCode);
  fillText(form, "ORG1", orgCode);
  fillText(form, "ACT1", accountCode);
  fillText(form, "PRG1", programCode);
  fillText(form, "Amount1", formatMoney(amount));
  fillText(form, "Description", description);
  if (handling === "business_affairs_pickup") {
    checkBox(form, "BusAffairsChq");
  } else if (handling === "other") {
    checkBox(form, "OtherChq");
    fillText(form, "OtherLocation", otherLocation);
  } else {
    checkBox(form, "MailChq");
  }

  form.flatten();
  const pdfBytes = await pdfDoc.save();
  const filename = `${safeFilePart(contractorName)}-installment-${installmentNumber}-check-request.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
