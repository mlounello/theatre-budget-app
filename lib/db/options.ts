import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type AccountCodeOption, type ProductionCategoryOption, type FiscalYearOption, type OrganizationOption, type FoapalOption, type GuestArtistOption, type UnionAgreementOption, asNumber, type UnionContributionType } from "@/lib/db/shared";

export type FundOption = {
  id: string;
  code: string;
  name: string;
  label: string;
  active: boolean;
};

export type ProgramOption = {
  id: string;
  code: string;
  name: string;
  label: string;
  active: boolean;
};

export type UnionFundOption = {
  id: string;
  name: string;
  vendorNumber: string | null;
  foapalId: string | null;
  checkRequestHandling: "mail" | "business_affairs_pickup" | "other";
  checkRequestOtherLocation: string | null;
  vendorAddress1: string | null;
  vendorAddress2: string | null;
  vendorAddress3: string | null;
  taxIdLast4: string | null;
  notes: string | null;
  active: boolean;
};

export type AccountCodeAdminRow = {
  id: string;
  code: string;
  category: string;
  name: string;
  isRevenue: boolean;
  active: boolean;
};

export type ProductionCategoryAdminRow = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export async function getTemplateNames(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("budget_templates").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}

export async function getAccountCodeOptions(): Promise<AccountCodeOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_codes")
    .select("id, code, category, name, is_revenue")
    .eq("active", true)
    .order("is_revenue", { ascending: false })
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    isRevenue: Boolean(row.is_revenue as boolean | null),
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}${Boolean(row.is_revenue as boolean | null) ? " | Revenue" : ""}`
  }));
}

export async function getAccountCodesAdmin(): Promise<AccountCodeAdminRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_codes")
    .select("id, code, category, name, is_revenue, active")
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    isRevenue: Boolean(row.is_revenue as boolean | null),
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getProductionCategoryOptions(): Promise<ProductionCategoryOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("production_categories")
    .select("id, name, sort_order")
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getProductionCategoriesAdmin(): Promise<ProductionCategoryAdminRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("production_categories")
    .select("id, name, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number | null) ?? 0,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getFiscalYearOptions(): Promise<FiscalYearOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id, name, start_date, end_date, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  return getFiscalYearOrganizationOptions();
}

export async function getFiscalYearOrganizationOptions(fiscalYearId?: string | null): Promise<OrganizationOption[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("fiscal_year_organizations")
    .select(
      "id, fiscal_year_id, sort_order, project_tracking_required, fiscal_years(name), organizations(id, name, org_code, active, superseded_by_organization_id)"
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (fiscalYearId) query = query.eq("fiscal_year_id", fiscalYearId);
  const { data, error } = await query;
  if (error) throw error;

  const options = (data ?? [])
    .map((row): OrganizationOption | null => {
      const organization = row.organizations as
        | {
            id?: string;
            name?: string;
            org_code?: string;
            active?: boolean;
            superseded_by_organization_id?: string | null;
          }
        | null;
      if (!organization?.id || organization.active === false || organization.superseded_by_organization_id) return null;
      const fy = row.fiscal_years as { name?: string } | null;
      const fiscalYearName = fy?.name ?? null;
      return {
        id: organization.id,
        name: organization.name ?? "Organization",
        orgCode: organization.org_code ?? "",
        fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
        fiscalYearName,
        sortOrder: (row.sort_order as number | null) ?? 0,
        projectTrackingRequired: (row.project_tracking_required as boolean | null) ?? true,
        label: `${organization.org_code ?? ""} | ${organization.name ?? "Organization"}${
          fiscalYearName ? ` (${fiscalYearName})` : ""
        }`
      };
    })
    .filter((option): option is OrganizationOption => option !== null);

  const onePerFiscalYearAndCode = new Map<string, OrganizationOption>();
  for (const option of options) {
    const key = `${option.fiscalYearId ?? "global"}:${option.orgCode.trim().toLowerCase()}`;
    if (!onePerFiscalYearAndCode.has(key)) onePerFiscalYearAndCode.set(key, option);
  }

  return Array.from(onePerFiscalYearAndCode.values()).sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (a.fiscalYearName ?? "").localeCompare(b.fiscalYearName ?? "") ||
        a.orgCode.localeCompare(b.orgCode) ||
        a.name.localeCompare(b.name)
  );
}

export async function getFundOptions(): Promise<FundOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("funds")
    .select("id, code, name, active")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) {
    if (error.message.toLowerCase().includes("funds")) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.name as string}`,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getProgramOptions(): Promise<ProgramOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id, code, name, active")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) {
    if (error.message.toLowerCase().includes("programs")) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.name as string}`,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getFoapalOptions(): Promise<FoapalOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("foapals")
    .select("id, fund_id, organization_id, program_id, label, active, funds(code, name), organizations(org_code, name), programs(code, name)")
    .order("sort_order", { ascending: true });
  if (error) {
    if (error.message.toLowerCase().includes("foapals")) return [];
    throw error;
  }
  return (data ?? []).map((row) => {
    const fund = row.funds as { code?: string | null; name?: string | null } | null;
    const organization = row.organizations as { org_code?: string | null; name?: string | null } | null;
    const program = row.programs as { code?: string | null; name?: string | null } | null;
    const fundCode = fund?.code ?? "";
    const orgCode = organization?.org_code ?? "";
    const programCode = program?.code ?? "";
    const fallbackLabel = [fundCode, orgCode, programCode].filter(Boolean).join(" - ");
    return {
      id: row.id as string,
      fundId: row.fund_id as string,
      fundCode,
      organizationId: row.organization_id as string,
      orgCode,
      organizationName: organization?.name ?? "",
      programId: row.program_id as string,
      programCode,
      label: ((row.label as string | null) ?? "").trim() || fallbackLabel,
      active: Boolean(row.active as boolean | null)
    };
  });
}

export async function getGuestArtistOptions(): Promise<GuestArtistOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("guest_artists")
    .select(
      "id, display_name, vendor_number, email, phone, default_foapal_id, default_check_request_handling, default_check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_last4, is_union, default_union_agreement_id, notes, active"
    )
    .order("display_name", { ascending: true });
  if (error) {
    if (error.message.toLowerCase().includes("guest_artists")) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    vendorNumber: (row.vendor_number as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    defaultFoapalId: (row.default_foapal_id as string | null) ?? null,
    defaultCheckRequestHandling: ((row.default_check_request_handling as string | null) ?? "mail") as
      | "mail"
      | "business_affairs_pickup"
      | "other",
    defaultCheckRequestOtherLocation: (row.default_check_request_other_location as string | null) ?? null,
    vendorAddress1: (row.vendor_address1 as string | null) ?? null,
    vendorAddress2: (row.vendor_address2 as string | null) ?? null,
    vendorAddress3: (row.vendor_address3 as string | null) ?? null,
    taxIdLast4: (row.tax_id_last4 as string | null) ?? null,
    isUnion: Boolean(row.is_union as boolean | null),
    defaultUnionAgreementId: (row.default_union_agreement_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getUnionFundOptions(): Promise<UnionFundOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("union_funds")
    .select(
      "id, name, vendor_number, foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_last4, notes, active"
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    vendorNumber: (row.vendor_number as string | null) ?? null,
    foapalId: (row.foapal_id as string | null) ?? null,
    checkRequestHandling: ((row.check_request_handling as string | null) ?? "mail") as
      | "mail"
      | "business_affairs_pickup"
      | "other",
    checkRequestOtherLocation: (row.check_request_other_location as string | null) ?? null,
    vendorAddress1: (row.vendor_address1 as string | null) ?? null,
    vendorAddress2: (row.vendor_address2 as string | null) ?? null,
    vendorAddress3: (row.vendor_address3 as string | null) ?? null,
    taxIdLast4: (row.tax_id_last4 as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: Boolean(row.active as boolean | null)
  }));
}

export async function getUnionAgreementOptions(): Promise<UnionAgreementOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("union_agreements")
    .select(
      "id, name, union_name, version_label, effective_from, effective_to, notes, active, union_agreement_funds(id, union_fund_id, percentage, contribution_type, sort_order, union_funds(name))"
    )
    .order("active", { ascending: false })
    .order("effective_from", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    unionName: row.union_name as string,
    versionLabel: row.version_label as string,
    effectiveFrom: (row.effective_from as string | null) ?? null,
    effectiveTo: (row.effective_to as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: Boolean(row.active as boolean | null),
    funds: (
      (row.union_agreement_funds as Array<{
        id?: string;
        union_fund_id?: string;
        percentage?: string | number;
        contribution_type?: string;
        sort_order?: number;
        union_funds?: { name?: string } | null;
      }> | null) ?? []
    )
      .map((fund) => ({
        id: fund.id as string,
        unionFundId: fund.union_fund_id as string,
        fundName: fund.union_funds?.name ?? "Union Fund",
        percentage: asNumber(fund.percentage ?? 0),
        contributionType: (fund.contribution_type ?? "employer_paid") as UnionContributionType,
        sortOrder: Number(fund.sort_order ?? 0)
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.fundName.localeCompare(b.fundName))
  }));
}
