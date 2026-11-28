import { getSupabaseServerClient } from "@/lib/supabase-server";

export function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type DashboardOpenRequisition = {
  id: string;
  projectId: string | null;
  organizationId: string | null;
  budgetType: "theatre" | "non_theatre";
  fiscalYearId: string | null;
  projectName: string;
  season: string | null;
  title: string;
  requisitionNumber: string | null;
  poNumber: string | null;
  receivingDocCodes: string[];
  vendorName: string | null;
  procurementStatus: string;
  orderValue: number;
};

export const STORAGE_REFERENCE_PREFIX = "storage:";

export function parseStorageReference(value: string | null | undefined): { bucket: string; path: string } | null {
  if (!value || !value.startsWith(STORAGE_REFERENCE_PREFIX)) return null;
  const normalized = value.slice(STORAGE_REFERENCE_PREFIX.length);
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= normalized.length - 1) return null;
  return {
    bucket: normalized.slice(0, slashIndex),
    path: normalized.slice(slashIndex + 1)
  };
}

export async function resolveAttachmentUrls(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  storedValues: Array<string | null | undefined>
): Promise<Map<string, string | null>> {
  const uniqueStoredValues = [...new Set(storedValues.filter((value): value is string => Boolean(value)))];
  const resolved = new Map<string, string | null>();

  await Promise.all(
    uniqueStoredValues.map(async (storedValue) => {
      const parsed = parseStorageReference(storedValue);
      if (!parsed) {
        resolved.set(storedValue, storedValue);
        return;
      }

      const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 60 * 60);
      if (error) {
        resolved.set(storedValue, null);
        return;
      }

      resolved.set(storedValue, data.signedUrl);
    })
  );

  return resolved;
}

export type UnionContributionType = "employer_paid" | "artist_withholding";

export type FoapalOption = {
  id: string;
  fundId: string;
  fundCode: string;
  organizationId: string;
  orgCode: string;
  organizationName: string;
  programId: string;
  programCode: string;
  label: string;
  active: boolean;
};

export type GuestArtistOption = {
  id: string;
  displayName: string;
  vendorNumber: string | null;
  email: string | null;
  phone: string | null;
  defaultFoapalId: string | null;
  defaultCheckRequestHandling: "mail" | "business_affairs_pickup" | "other";
  defaultCheckRequestOtherLocation: string | null;
  vendorAddress1: string | null;
  vendorAddress2: string | null;
  vendorAddress3: string | null;
  taxIdLast4: string | null;
  isUnion: boolean;
  defaultUnionAgreementId: string | null;
  notes: string | null;
  active: boolean;
};

export type UnionAgreementFundOption = {
  id: string;
  unionFundId: string;
  fundName: string;
  percentage: number;
  contributionType: UnionContributionType;
  sortOrder: number;
};

export type UnionAgreementOption = {
  id: string;
  name: string;
  unionName: string;
  versionLabel: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  active: boolean;
  funds: UnionAgreementFundOption[];
};

export type ProcurementProjectOption = {
  id: string;
  name: string;
  label: string;
  organizationId: string | null;
  fiscalYearId: string | null;
  isExternal: boolean;
};

export type ProductionCategoryOption = {
  id: string;
  name: string;
  sortOrder: number;
};

export type SettingsProject = {
  id: string;
  name: string;
  season: string | null;
  organizationId: string | null;
  fiscalYearId: string | null;
  planningRequestsEnabled: boolean;
  sortOrder: number;
};

export type AccountCodeOption = {
  id: string;
  code: string;
  category: string;
  name: string;
  isRevenue: boolean;
  label: string;
};

export type FiscalYearOption = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
};

export type OrganizationOption = {
  id: string;
  name: string;
  orgCode: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  sortOrder: number;
  projectTrackingRequired: boolean;
  label: string;
};
