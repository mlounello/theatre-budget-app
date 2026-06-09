import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { generateVarianceWorkbook, type VarianceWorkbookLine } from "@/lib/variance-workbook";

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelFor(row: { org_code?: string | null; name?: string | null } | undefined): string {
  if (!row) return "";
  return [row.org_code, row.name].filter(Boolean).join(" | ");
}

export async function GET(_request: Request, { params }: { params: Promise<{ varianceId: string }> }) {
  const access = await getAccessContext();
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "project_manager"].includes(access.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { varianceId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: variance, error: varianceError } = await supabase
    .from("variance_requests")
    .select("id, created_at, approved_at, created_by_user_id, triggering_purchase_id, purchases(title, reference_number), users(full_name)")
    .eq("id", varianceId)
    .single();
  if (varianceError || !variance) return NextResponse.json({ error: "Variance not found" }, { status: 404 });

  const { data: linesData, error: linesError } = await supabase
    .from("variance_request_lines")
    .select(
      "id, transfer_amount, narrative, from_organization_id, from_account_code_id, from_month_start, to_organization_id, to_account_code_id, to_month_start"
    )
    .eq("variance_request_id", varianceId)
    .order("created_at", { ascending: true });
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
  if (!linesData || linesData.length === 0) return NextResponse.json({ error: "No variance lines found" }, { status: 404 });

  const organizationIds = Array.from(
    new Set(
      linesData
        .flatMap((line) => [line.from_organization_id as string | null, line.to_organization_id as string | null])
        .filter((value): value is string => Boolean(value))
    )
  );
  const accountCodeIds = Array.from(
    new Set(
      linesData
        .flatMap((line) => [line.from_account_code_id as string | null, line.to_account_code_id as string | null])
        .filter((value): value is string => Boolean(value))
    )
  );

  const [{ data: organizationsData, error: organizationsError }, { data: accountCodesData, error: accountCodesError }] =
    await Promise.all([
      supabase.from("organizations").select("id, org_code, name").in("id", organizationIds),
      supabase.from("account_codes").select("id, code, name, category").in("id", accountCodeIds)
    ]);
  if (organizationsError) return NextResponse.json({ error: organizationsError.message }, { status: 500 });
  if (accountCodesError) return NextResponse.json({ error: accountCodesError.message }, { status: 500 });

  const organizationById = new Map(
    ((organizationsData ?? []) as Array<{ id?: string; org_code?: string | null; name?: string | null }>).map((row) => [row.id ?? "", row])
  );
  const accountById = new Map(
    ((accountCodesData ?? []) as Array<{ id?: string; code?: string | null; name?: string | null; category?: string | null }>).map((row) => [
      row.id ?? "",
      row
    ])
  );

  const requestor = ((variance.users as { full_name?: string | null } | null)?.full_name ?? "").trim();
  const purchase = variance.purchases as { title?: string | null; reference_number?: string | null } | null;
  const generatedDate = new Date().toISOString().slice(0, 10);

  const workbookLines: VarianceWorkbookLine[] = linesData.map((line) => {
    const fromOrg = organizationById.get((line.from_organization_id as string | null) ?? "");
    const toOrg = organizationById.get((line.to_organization_id as string | null) ?? "");
    const fromAccount = accountById.get((line.from_account_code_id as string | null) ?? "");
    const toAccount = accountById.get((line.to_account_code_id as string | null) ?? "");
    const amount = asNumber(line.transfer_amount as string | number | null);
    const narrative =
      (line.narrative as string | null) ||
      `Variance for ${purchase?.title ?? "request"}${purchase?.reference_number ? ` (${purchase.reference_number})` : ""}.`;

    return {
      requestor,
      approvedBy: "",
      date: generatedDate,
      fromFund: "",
      fromFundDescription: "",
      fromOrg: fromOrg?.org_code ?? "",
      fromOrgDescription: labelFor(fromOrg),
      fromAccount: fromAccount?.code ?? "",
      fromAccountDescription: [fromAccount?.category, fromAccount?.name].filter(Boolean).join(" | "),
      fromAmountMonth: amount,
      toFund: "",
      toFundDescription: "",
      toOrg: toOrg?.org_code ?? "",
      toOrgDescription: labelFor(toOrg),
      toAccount: toAccount?.code ?? "",
      toAccountDescription: [toAccount?.category, toAccount?.name].filter(Boolean).join(" | "),
      toAmountMonth: amount,
      narrative
    };
  });

  const buffer = await generateVarianceWorkbook(workbookLines);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="variance-${varianceId}.xlsx"`
    }
  });
}
