import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { getAccessContext } from "@/lib/access";
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

export async function GET(_request: Request, { params }: RouteParams) {
  const access = await getAccessContext();
  if (!access.userId) return NextResponse.redirect(new URL("/login", _request.url));
  if (!["admin", "project_manager"].includes(access.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { contractId, installmentId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("contract_installments")
    .select(
      "id, contract_id, installment_number, installment_amount, due_date, ap_receive_by, mail_by, contracts!inner(id, project_id, organization_id, banner_account_code_id, contractor_name, contractor_employee_id, notes, projects(name, season), organizations(org_code, name), account_codes(code, name))"
    )
    .eq("id", installmentId)
    .eq("contract_id", contractId)
    .single();
  if (error || !data) {
    return new NextResponse("Check request installment not found.", { status: 404 });
  }

  const contractJoin = data.contracts as
    | {
        id?: string;
        project_id?: string;
        contractor_name?: string | null;
        contractor_employee_id?: string | null;
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
  const season = contractJoin?.projects?.season ? ` (${contractJoin.projects.season})` : "";
  const orgCode = contractJoin?.organizations?.org_code ?? "";
  const accountCode = contractJoin?.account_codes?.code ?? "";
  const submissionDate = (data.mail_by as string | null) ?? (data.ap_receive_by as string | null) ?? null;
  const description = [
    `Contract payment ${installmentNumber} for ${contractorName}`,
    `${projectName}${season}`,
    data.due_date ? `Due ${formatDate(data.due_date as string)}` : null
  ]
    .filter(Boolean)
    .join(" - ");

  fillText(form, "VendorName", contractorName);
  fillText(form, "Date", formatDate(submissionDate));
  fillText(form, "VendorNumber", contractJoin?.contractor_employee_id ?? "");
  fillText(form, "TaxOrSSN", "");
  fillText(form, "ORG1", orgCode);
  fillText(form, "ACT1", accountCode);
  fillText(form, "Amount1", formatMoney(amount));
  fillText(form, "Description", description);
  checkBox(form, "MailChq");

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
