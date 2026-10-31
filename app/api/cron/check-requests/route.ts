import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GET as installmentPdf } from "@/app/contracts/[contractId]/installments/[installmentId]/check-request/route";
import { GET as unionPdf } from "@/app/contracts/[contractId]/union-contributions/[contributionId]/check-request/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DueItem = {
  kind: "installment" | "union";
  id: string;
  contractId: string;
  purchaseId: string | null;
  amount: number;
  contractorName: string;
  contractorEmployeeId: string | null;
  w9Path: string | null;
};

function todayInNewYork() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function contractOf(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

async function buildPacket(items: DueItem[], secret: string): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const item of items) {
    const request = new Request("https://theatrebudgetapp.mlounello.com/api/cron/check-requests", {
      headers: { authorization: `Bearer ${secret}` }
    });
    const response = item.kind === "installment"
      ? await installmentPdf(request, { params: Promise.resolve({ contractId: item.contractId, installmentId: item.id }) })
      : await unionPdf(request, { params: Promise.resolve({ contractId: item.contractId, contributionId: item.id }) });
    if (!response.ok) throw new Error((await response.text()) || `Could not generate ${item.kind} check request.`);
    const source = await PDFDocument.load(await response.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return Buffer.from(await merged.save({ useObjectStreams: false }));
}

async function sendPacket(input: { packet: Buffer; date: string; items: DueItem[]; w9s: Array<{ filename: string; bytes: Buffer }> }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CHECK_REQUEST_FROM_EMAIL?.trim() || process.env.MAGIC_LINK_FROM_EMAIL?.trim();
  const recipient = process.env.CHECK_REQUEST_AP_EMAIL?.trim() || "accountspayable@siena.edu";
  const cc = process.env.CHECK_REQUEST_CC_EMAIL?.trim() || "mlounello@siena.edu";
  if (!apiKey || !from) throw new Error("Check-request email credentials are not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `check-request-run-${input.date}-${randomUUID()}`
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      cc: [cc],
      subject: `Theatre check requests — ${input.date}`,
      text: `Attached is the reviewed Theatre check-request packet for ${input.date}. It contains ${input.items.length} check request${input.items.length === 1 ? "" : "s"}. W-9s are attached for payees without a Banner / Vendor ID.`,
      html: `<p>Attached is the reviewed Theatre check-request packet for <strong>${input.date}</strong>.</p><p>It contains ${input.items.length} check request${input.items.length === 1 ? "" : "s"}. W-9s are attached for payees without a Banner / Vendor ID.</p>`,
      attachments: [
        { filename: `theatre-check-requests-${input.date}.pdf`, content: input.packet.toString("base64") },
        ...input.w9s.map((w9) => ({ filename: w9.filename, content: w9.bytes.toString("base64") }))
      ]
    })
  });
  if (!response.ok) throw new Error(`Accounts Payable email failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as { id?: string };
  return { id: body.id ?? null, recipient, cc };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const supabase = createSupabaseAdminClient();
  const date = todayInNewYork();
  const [installmentsResult, unionResult] = await Promise.all([
    supabase.from("contract_installments").select("id, contract_id, purchase_id, installment_amount, mail_by, automation_status, contracts!inner(contractor_name, contractor_employee_id, w9_attachment_path, workflow_status, union_signature_status, engagement_type)").eq("automation_status", "ready").eq("status", "planned").lte("mail_by", date),
    supabase.from("contract_union_contributions").select("id, contract_id, purchase_id, amount, mail_by, automation_status, contracts!inner(contractor_name, contractor_employee_id, w9_attachment_path, workflow_status, union_signature_status, engagement_type)").eq("automation_status", "ready").eq("status", "planned").lte("mail_by", date)
  ]);
  if (installmentsResult.error) return NextResponse.json({ error: installmentsResult.error.message }, { status: 500 });
  if (unionResult.error) return NextResponse.json({ error: unionResult.error.message }, { status: 500 });

  const items: DueItem[] = [];
  for (const [kind, rows] of [["installment", installmentsResult.data ?? []], ["union", unionResult.data ?? []]] as const) {
    for (const row of rows) {
      const payment = row as Record<string, unknown>;
      const contract = contractOf(row.contracts);
      const engagement = String(contract?.engagement_type ?? "");
      const executed = contract?.workflow_status === "siena_signed" && (engagement !== "union_freelance_artist" || contract?.union_signature_status === "complete");
      const bannerId = String(contract?.contractor_employee_id ?? "").trim() || null;
      const w9Path = String(contract?.w9_attachment_path ?? "").trim() || null;
      if (!executed || !["independent_contractor", "union_freelance_artist"].includes(engagement) || (!bannerId && !w9Path)) continue;
      items.push({
        kind,
        id: String(payment.id),
        contractId: String(payment.contract_id),
        purchaseId: payment.purchase_id ? String(payment.purchase_id) : null,
        amount: Number(kind === "installment" ? payment.installment_amount : payment.amount),
        contractorName: String(contract?.contractor_name ?? "Payee"),
        contractorEmployeeId: bannerId,
        w9Path
      });
    }
  }
  if (items.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "No READY check requests are due." });

  const runId = randomUUID();
  const recipient = process.env.CHECK_REQUEST_AP_EMAIL?.trim() || "accountspayable@siena.edu";
  const cc = process.env.CHECK_REQUEST_CC_EMAIL?.trim() || "mlounello@siena.edu";
  await supabase.from("check_request_runs").insert({ id: runId, scheduled_for: date, status: "building", item_count: items.length, recipient_email: recipient, cc_email: cc });
  for (const kind of ["installment", "union"] as const) {
    const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
    if (ids.length) await supabase.from(kind === "installment" ? "contract_installments" : "contract_union_contributions").update({ automation_status: "sending", automation_run_id: runId, automation_last_error: null }).in("id", ids).eq("automation_status", "ready");
  }

  try {
    const packet = await buildPacket(items, secret);
    const w9s: Array<{ filename: string; bytes: Buffer }> = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.contractorEmployeeId || !item.w9Path || seen.has(item.w9Path)) continue;
      seen.add(item.w9Path);
      const { data, error } = await supabase.storage.from("contract-w9s").download(item.w9Path);
      if (error || !data) throw new Error(`Could not attach W-9 for ${item.contractorName}.`);
      w9s.push({ filename: `${item.contractorName.replace(/[^a-z0-9]+/gi, "-")}-W9.pdf`, bytes: Buffer.from(await data.arrayBuffer()) });
    }
    const email = await sendPacket({ packet, date, items, w9s });
    const now = new Date().toISOString();
    for (const kind of ["installment", "union"] as const) {
      const kindItems = items.filter((item) => item.kind === kind);
      const ids = kindItems.map((item) => item.id);
      if (ids.length) await supabase.from(kind === "installment" ? "contract_installments" : "contract_union_contributions").update({ automation_status: "sent", automation_sent_at: now, status: "check_request_submitted", check_request_submitted_on: date, automation_last_error: null }).in("id", ids).eq("automation_run_id", runId);
    }
    for (const item of items) {
      if (!item.purchaseId) continue;
      await supabase.from("purchases").update({ status: "encumbered", requested_amount: 0, encumbered_amount: item.amount, pending_cc_amount: 0, posted_amount: 0, procurement_status: "ordered" }).eq("id", item.purchaseId);
    }
    const names = [`theatre-check-requests-${date}.pdf`, ...w9s.map((w9) => w9.filename)];
    await supabase.from("check_request_runs").update({ status: "sent", sent_at: now, resend_email_id: email.id, attachment_names: names }).eq("id", runId);
    return NextResponse.json({ ok: true, sent: items.length, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic check-request run failed.";
    for (const kind of ["installment", "union"] as const) {
      const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
      if (ids.length) await supabase.from(kind === "installment" ? "contract_installments" : "contract_union_contributions").update({ automation_status: "failed", automation_last_error: message }).in("id", ids).eq("automation_run_id", runId);
    }
    await supabase.from("check_request_runs").update({ status: "failed", error_message: message }).eq("id", runId);
    return NextResponse.json({ ok: false, error: message, runId }, { status: 500 });
  }
}
