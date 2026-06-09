type SupabaseClientLike = {
  from: (table: string) => SupabaseQueryLike;
  rpc: (fn: string, args?: Record<string, unknown>) => SupabaseQueryLike;
};

type SupabaseQueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

type SupabaseQueryLike = PromiseLike<SupabaseQueryResult> & {
  select: (...args: unknown[]) => SupabaseQueryLike;
  insert: (...args: unknown[]) => SupabaseQueryLike;
  update: (...args: unknown[]) => SupabaseQueryLike;
  delete: (...args: unknown[]) => SupabaseQueryLike;
  eq: (...args: unknown[]) => SupabaseQueryLike;
  in: (...args: unknown[]) => SupabaseQueryLike;
  lte: (...args: unknown[]) => SupabaseQueryLike;
  gte: (...args: unknown[]) => SupabaseQueryLike;
  order: (...args: unknown[]) => SupabaseQueryLike;
  limit: (...args: unknown[]) => SupabaseQueryLike;
  maybeSingle: () => Promise<SupabaseQueryResult>;
  single: () => Promise<SupabaseQueryResult>;
};

function asDb(supabase: unknown): SupabaseClientLike {
  return supabase as SupabaseClientLike;
}

type FiscalYearRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
};

type PurchaseForInstitutionalBudget = {
  id: string;
  project_id: string;
  organization_id: string | null;
  banner_account_code_id: string | null;
  ordered_on: string | null;
  purchase_date?: string | null;
  posted_date: string | null;
  created_at: string | null;
  status: string | null;
  request_type: string | null;
  title: string | null;
  estimated_amount: string | number | null;
  requested_amount: string | number | null;
  encumbered_amount: string | number | null;
  pending_cc_amount: string | number | null;
  posted_amount: string | number | null;
  projects?: {
    organization_id?: string | null;
  } | null;
};

type AllocationForInstitutionalBudget = {
  id: string;
  account_code_id: string | null;
  amount: string | number | null;
};

type BudgetBucket = {
  fiscalYearId: string;
  organizationId: string;
  accountCodeId: string;
  budgetPlanMonthId: string;
  monthStart: string;
};

export type InstitutionalSyncResult = {
  ok: boolean;
  skippedReason?: string;
  commitmentCount: number;
  committedAmount: number;
  varianceRequired: boolean;
  shortageAmount: number;
};

function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function monthStartIso(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

export function determineFiscalMonthFromOrderDate(orderDate: string): { monthStart: string; fiscalMonthIndex: number } {
  const monthStart = monthStartIso(orderDate);
  const month = Number.parseInt(orderDate.slice(5, 7), 10);
  const fiscalMonthIndex = month >= 6 ? month - 5 : month + 7;
  return { monthStart, fiscalMonthIndex };
}

export function determineInstitutionalOrderDate(purchase: PurchaseForInstitutionalBudget): string {
  return (
    toIsoDateOnly(purchase.ordered_on) ??
    toIsoDateOnly(purchase.purchase_date ?? null) ??
    toIsoDateOnly(purchase.posted_date) ??
    toIsoDateOnly(purchase.created_at) ??
    new Date().toISOString().slice(0, 10)
  );
}

export async function determineFiscalYearFromDate(
  supabase: unknown,
  dateIso: string
): Promise<FiscalYearRow | null> {
  const db = asDb(supabase);
  const { data, error } = await db
    .from("fiscal_years")
    .select("id, name, start_date, end_date")
    .lte("start_date", dateIso)
    .gte("end_date", dateIso)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FiscalYearRow | null) ?? null;
}

export async function resolveInstitutionalBudgetBucket(
  supabase: unknown,
  params: {
    fiscalYearId: string;
    organizationId: string;
    accountCodeId: string;
    orderDate: string;
  }
): Promise<BudgetBucket | null> {
  const db = asDb(supabase);
  const { monthStart } = determineFiscalMonthFromOrderDate(params.orderDate);
  const { data: plan, error: planError } = await db
    .from("budget_plans")
    .select("id")
    .eq("fiscal_year_id", params.fiscalYearId)
    .eq("organization_id", params.organizationId)
    .eq("account_code_id", params.accountCodeId)
    .maybeSingle();
  if (planError) throw new Error(planError.message);
  const planRow = plan as { id?: string } | null;
  if (!planRow?.id) return null;

  const { data: month, error: monthError } = await db
    .from("budget_plan_months")
    .select("id, month_start")
    .eq("budget_plan_id", planRow.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  if (monthError) throw new Error(monthError.message);
  const monthRow = month as { id?: string; month_start?: string } | null;
  if (!monthRow?.id) return null;

  return {
    fiscalYearId: params.fiscalYearId,
    organizationId: params.organizationId,
    accountCodeId: params.accountCodeId,
    budgetPlanMonthId: monthRow.id,
    monthStart: monthRow.month_start ?? monthStart
  };
}

export async function calculateInstitutionalAvailability(
  supabase: unknown,
  budgetPlanMonthId: string
): Promise<number> {
  const db = asDb(supabase);
  const { data, error } = await db
    .from("v_institutional_monthly_budget_availability")
    .select("official_available_amount")
    .eq("budget_plan_month_id", budgetPlanMonthId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { official_available_amount?: string | number | null } | null;
  return asNumber(row?.official_available_amount);
}

function activeCommitmentAmount(purchase: PurchaseForInstitutionalBudget): number {
  const status = String(purchase.status ?? "").toLowerCase();
  if (status === "cancelled") return 0;
  if (status === "posted") return asNumber(purchase.posted_amount);
  if (status === "pending_cc") return asNumber(purchase.pending_cc_amount);
  if (status === "encumbered") return asNumber(purchase.encumbered_amount);
  if (status === "requested") {
    const requested = asNumber(purchase.requested_amount);
    return requested !== 0 ? requested : asNumber(purchase.estimated_amount);
  }
  return asNumber(purchase.requested_amount) || asNumber(purchase.estimated_amount) || asNumber(purchase.posted_amount);
}

function allocationCommitmentAmount(
  purchaseAmount: number,
  allocation: AllocationForInstitutionalBudget,
  allocationTotal: number
): number {
  const allocationAmount = asNumber(allocation.amount);
  if (allocationTotal === 0) return allocationAmount;
  return Number(((purchaseAmount * allocationAmount) / allocationTotal).toFixed(2));
}

export async function detectVarianceRequirement(
  supabase: unknown,
  budgetPlanMonthIds: string[]
): Promise<{ varianceRequired: boolean; shortageAmount: number; fiscalYearId: string | null }> {
  if (budgetPlanMonthIds.length === 0) return { varianceRequired: false, shortageAmount: 0, fiscalYearId: null };
  const db = asDb(supabase);
  const uniqueIds = [...new Set(budgetPlanMonthIds)];
  const { data, error } = await db
    .from("v_institutional_monthly_budget_availability")
    .select("fiscal_year_id, official_available_amount")
    .in("budget_plan_month_id", uniqueIds);
  if (error) throw new Error(error.message);
  let shortageAmount = 0;
  let fiscalYearId: string | null = null;
  for (const row of (data ?? []) as Array<{ fiscal_year_id?: string | null; official_available_amount?: string | number | null }>) {
    fiscalYearId = fiscalYearId ?? row.fiscal_year_id ?? null;
    const available = asNumber(row.official_available_amount);
    if (available < 0) shortageAmount += Math.abs(available);
  }
  return { varianceRequired: shortageAmount > 0, shortageAmount: Number(shortageAmount.toFixed(2)), fiscalYearId };
}

export async function createDraftVarianceRequest(
  supabase: unknown,
  params: {
    fiscalYearId: string;
    triggeringPurchaseId: string;
    shortageAmount: number;
    userId: string | null;
    reason: string;
  }
): Promise<void> {
  const db = asDb(supabase);
  const { data: existing, error: existingError } = await db
    .from("variance_requests")
    .select("id")
    .eq("triggering_purchase_id", params.triggeringPurchaseId)
    .in("status", ["draft", "ready_for_review", "submitted", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const existingRow = existing as { id?: string } | null;

  if (existingRow?.id) {
    const { error } = await db
      .from("variance_requests")
      .update({
        fiscal_year_id: params.fiscalYearId,
        reason: params.reason,
        total_transfer_amount: params.shortageAmount
      })
      .eq("id", existingRow.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: variance, error } = await db
    .from("variance_requests")
    .insert({
      fiscal_year_id: params.fiscalYearId,
      triggering_purchase_id: params.triggeringPurchaseId,
      status: "draft",
      reason: params.reason,
      total_transfer_amount: params.shortageAmount,
      created_by_user_id: params.userId
    })
    .select("id")
    .single();
  const varianceRow = variance as { id?: string } | null;
  if (error || !varianceRow?.id) throw new Error(error?.message ?? "Could not create variance draft.");

  const { error: eventError } = await db.from("variance_events").insert({
    variance_request_id: varianceRow.id,
    from_status: null,
    to_status: "draft",
    changed_by_user_id: params.userId,
    note: "Variance draft created from institutional budget shortage"
  });
  if (eventError) throw new Error(eventError.message);
}

export async function createInstitutionalCommitmentForPurchase(
  supabase: unknown,
  purchaseId: string,
  userId: string | null = null
): Promise<InstitutionalSyncResult> {
  const db = asDb(supabase);
  const { error: deleteError } = await db.from("institutional_budget_commitments").delete().eq("purchase_id", purchaseId);
  if (deleteError) throw new Error(deleteError.message);

  const { data: purchase, error: purchaseError } = await db
    .from("purchases")
    .select(
      "id, project_id, organization_id, banner_account_code_id, ordered_on, purchase_date, posted_date, created_at, status, request_type, title, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, projects(organization_id)"
    )
    .eq("id", purchaseId)
    .single();
  if (purchaseError || !purchase) throw new Error(purchaseError?.message ?? "Purchase not found.");

  const purchaseRow = purchase as PurchaseForInstitutionalBudget;
  const purchaseAmount = activeCommitmentAmount(purchaseRow);
  if (purchaseAmount === 0) return { ok: true, skippedReason: "zero_or_cancelled_amount", commitmentCount: 0, committedAmount: 0, varianceRequired: false, shortageAmount: 0 };

  const organizationId = purchaseRow.organization_id ?? purchaseRow.projects?.organization_id ?? null;
  if (!organizationId) return { ok: true, skippedReason: "missing_organization", commitmentCount: 0, committedAmount: 0, varianceRequired: false, shortageAmount: 0 };

  const orderDate = determineInstitutionalOrderDate(purchaseRow);
  const fiscalYear = await determineFiscalYearFromDate(db, orderDate);
  if (!fiscalYear) return { ok: true, skippedReason: "missing_fiscal_year", commitmentCount: 0, committedAmount: 0, varianceRequired: false, shortageAmount: 0 };

  const { data: allocations, error: allocationsError } = await db
    .from("purchase_allocations")
    .select("id, account_code_id, amount")
    .eq("purchase_id", purchaseId);
  if (allocationsError) throw new Error(allocationsError.message);

  const allocationRows = ((allocations ?? []) as AllocationForInstitutionalBudget[]).filter(
    (allocation) => allocation.account_code_id ?? purchaseRow.banner_account_code_id
  );
  if (allocationRows.length === 0) return { ok: true, skippedReason: "missing_account_code", commitmentCount: 0, committedAmount: 0, varianceRequired: false, shortageAmount: 0 };

  const allocationTotal = allocationRows.reduce((sum, allocation) => sum + Math.abs(asNumber(allocation.amount)), 0);
  const commitments: Array<Record<string, unknown>> = [];
  for (const allocation of allocationRows) {
    const accountCodeId = allocation.account_code_id ?? purchaseRow.banner_account_code_id;
    if (!accountCodeId) continue;
    const committedAmount = allocationCommitmentAmount(purchaseAmount, allocation, allocationTotal);
    if (committedAmount === 0) continue;
    const bucket = await resolveInstitutionalBudgetBucket(db, {
      fiscalYearId: fiscalYear.id,
      organizationId,
      accountCodeId,
      orderDate
    });
    if (!bucket) continue;
    commitments.push({
      purchase_id: purchaseId,
      purchase_allocation_id: allocation.id,
      fiscal_year_id: bucket.fiscalYearId,
      organization_id: bucket.organizationId,
      account_code_id: bucket.accountCodeId,
      budget_plan_month_id: bucket.budgetPlanMonthId,
      order_date: orderDate,
      committed_amount: committedAmount,
      commitment_status: "submitted"
    });
  }

  if (commitments.length === 0) return { ok: true, skippedReason: "missing_budget_bucket", commitmentCount: 0, committedAmount: 0, varianceRequired: false, shortageAmount: 0 };

  const { error: insertError } = await db.from("institutional_budget_commitments").insert(commitments);
  if (insertError) throw new Error(insertError.message);

  const committedAmount = commitments.reduce((sum, row) => sum + asNumber(row.committed_amount as number), 0);
  const variance = await detectVarianceRequirement(
    db,
    commitments.map((row) => row.budget_plan_month_id as string)
  );
  if (variance.varianceRequired && variance.fiscalYearId) {
    await createDraftVarianceRequest(db, {
      fiscalYearId: variance.fiscalYearId,
      triggeringPurchaseId: purchaseId,
      shortageAmount: variance.shortageAmount,
      userId,
      reason: `Institutional monthly budget shortage for ${purchaseRow.title ?? "purchase"} (${purchaseId}).`
    });
  }

  return {
    ok: true,
    commitmentCount: commitments.length,
    committedAmount: Number(committedAmount.toFixed(2)),
    varianceRequired: variance.varianceRequired,
    shortageAmount: variance.shortageAmount
  };
}
