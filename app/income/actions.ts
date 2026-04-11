"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type IncomeType = "starting_budget" | "donation" | "ticket_sales" | "other";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIdsJson(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function parseIncomeType(value: string): IncomeType {
  if (value === "starting_budget" || value === "donation" || value === "ticket_sales" || value === "other") {
    return value;
  }
  return "other";
}

function defaultLineName(type: IncomeType): string {
  if (type === "starting_budget") return "Starting Budget";
  if (type === "donation") return "Donation";
  if (type === "ticket_sales") return "Ticket Sales";
  return "Other Income";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

export async function createIncomeEntryAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return err("You must be signed in.");

    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!organizationId) return err("Organization is required.");
    if (amount === 0) return err("Amount must be non-zero.");

    const lineName = lineNameInput || defaultLineName(incomeType);

    const withType = await supabase.from("income_lines").insert({
      organization_id: organizationId,
      project_id: null,
      production_category_id: productionCategoryId || null,
      banner_account_code_id: bannerAccountCodeId || null,
      line_name: lineName,
      reference_number: referenceNumber || null,
      amount,
      received_on: receivedOn || null,
      created_by_user_id: user.id,
      income_type: incomeType
    });

    if (withType.error) {
      const fallback = await supabase.from("income_lines").insert({
        organization_id: organizationId,
        project_id: null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        line_name: lineName,
        reference_number: referenceNumber || null,
        amount,
        received_on: receivedOn || null,
        created_by_user_id: user.id
      });
      if (fallback.error) return err(fallback.error.message);
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    return ok("Income entry saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save income entry."));
  }
}

export async function updateIncomeEntryAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return err("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!id) return err("Income entry id is required.");
    if (!organizationId) return err("Organization is required.");
    if (amount === 0) return err("Amount must be non-zero.");

    const lineName = lineNameInput || defaultLineName(incomeType);

    const withType = await supabase
      .from("income_lines")
      .update({
        organization_id: organizationId,
        project_id: null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        line_name: lineName,
        reference_number: referenceNumber || null,
        amount,
        received_on: receivedOn || null,
        income_type: incomeType
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (withType.error) {
      const fallback = await supabase
        .from("income_lines")
        .update({
          organization_id: organizationId,
          project_id: null,
          production_category_id: productionCategoryId || null,
          banner_account_code_id: bannerAccountCodeId || null,
          line_name: lineName,
          reference_number: referenceNumber || null,
          amount,
          received_on: receivedOn || null
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (fallback.error) return err(fallback.error.message);
      if (!fallback.data?.id) return err("Income entry update was not applied.");
    } else if (!withType.data?.id) {
      return err("Income entry update was not applied.");
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    return ok("Income entry updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update income entry."));
  }
}

export async function deleteIncomeEntryAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return err("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return err("Income entry id is required.");

    const { error } = await supabase.from("income_lines").delete().eq("id", id);
    if (error) return err(error.message);

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    return ok("Income entry deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete income entry."));
  }
}

export async function bulkUpdateIncomeEntriesAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return err("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one income entry.");

    const applyOrganization = formData.get("applyOrganization") === "on";
    const applyType = formData.get("applyIncomeType") === "on";
    const applyCategory = formData.get("applyProductionCategory") === "on";
    const applyBanner = formData.get("applyBannerAccountCode") === "on";
    const applyLineName = formData.get("applyLineName") === "on";
    const applyReference = formData.get("applyReferenceNumber") === "on";
    const applyAmount = formData.get("applyAmount") === "on";
    const applyReceivedOn = formData.get("applyReceivedOn") === "on";

    if (!applyOrganization && !applyType && !applyCategory && !applyBanner && !applyLineName && !applyReference && !applyAmount && !applyReceivedOn) {
      return err("Choose at least one field to apply.");
    }

    const targetOrganizationId = String(formData.get("organizationId") ?? "").trim();
    const targetIncomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const targetProductionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const targetBannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const targetLineName = String(formData.get("lineName") ?? "").trim();
    const targetReferenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const targetAmount = parseMoney(formData.get("amount"));
    const targetReceivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (applyOrganization && !targetOrganizationId) return err("Organization is required when applying organization.");
    if (applyAmount && targetAmount === 0) return err("Amount must be non-zero when applying amount.");

    const { data: existingRows, error: existingError } = await supabase
      .from("income_lines")
      .select("id, organization_id, production_category_id, banner_account_code_id, income_type, line_name, reference_number, amount, received_on")
      .in("id", ids);
    if (existingError) return err(existingError.message);
    if (!existingRows || existingRows.length !== ids.length) return err("Some selected income entries were not found.");

    for (const row of existingRows) {
      const nextOrganizationId = applyOrganization ? targetOrganizationId : ((row.organization_id as string | null) ?? "");
      if (!nextOrganizationId) return err("Organization cannot be empty.");

      const nextIncomeType = applyType ? targetIncomeType : parseIncomeType(String(row.income_type ?? "other"));
      const nextLineName = applyLineName
        ? targetLineName || defaultLineName(nextIncomeType)
        : (String(row.line_name ?? "").trim() || defaultLineName(nextIncomeType));
      if (!nextLineName) return err("Line name cannot be empty.");

      const nextAmount = applyAmount ? targetAmount : Number(row.amount ?? 0);
      if (nextAmount === 0) return err("Amount cannot be zero.");
    }

    for (const row of existingRows) {
      const nextOrganizationId = applyOrganization ? targetOrganizationId : ((row.organization_id as string | null) ?? "");
      if (!nextOrganizationId) return err("Organization cannot be empty.");

      const nextIncomeType = applyType ? targetIncomeType : parseIncomeType(String(row.income_type ?? "other"));
      const nextLineName = applyLineName
        ? targetLineName || defaultLineName(nextIncomeType)
        : (String(row.line_name ?? "").trim() || defaultLineName(nextIncomeType));
      const nextAmount = applyAmount ? targetAmount : Number(row.amount ?? 0);
      if (nextAmount === 0) return err("Amount cannot be zero.");

      const withType = await supabase
        .from("income_lines")
        .update({
          organization_id: nextOrganizationId,
          project_id: null,
          production_category_id: applyCategory
            ? targetProductionCategoryId || null
            : ((row.production_category_id as string | null) ?? null),
          banner_account_code_id: applyBanner ? targetBannerAccountCodeId || null : ((row.banner_account_code_id as string | null) ?? null),
          income_type: nextIncomeType,
          line_name: nextLineName,
          reference_number: applyReference ? targetReferenceNumber || null : ((row.reference_number as string | null) ?? null),
          amount: nextAmount,
          received_on: applyReceivedOn ? targetReceivedOn || null : ((row.received_on as string | null) ?? null)
        })
        .eq("id", row.id as string)
        .select("id")
        .maybeSingle();

      if (withType.error) {
        const fallback = await supabase
          .from("income_lines")
          .update({
            organization_id: nextOrganizationId,
            project_id: null,
            production_category_id: applyCategory
              ? targetProductionCategoryId || null
              : ((row.production_category_id as string | null) ?? null),
            banner_account_code_id: applyBanner ? targetBannerAccountCodeId || null : ((row.banner_account_code_id as string | null) ?? null),
            line_name: nextLineName,
            reference_number: applyReference ? targetReferenceNumber || null : ((row.reference_number as string | null) ?? null),
            amount: nextAmount,
            received_on: applyReceivedOn ? targetReceivedOn || null : ((row.received_on as string | null) ?? null)
          })
          .eq("id", row.id as string)
          .select("id")
          .maybeSingle();
        if (fallback.error) return err(fallback.error.message);
        if (!fallback.data?.id) return err("A bulk income update was not applied.");
      } else if (!withType.data?.id) {
        return err("A bulk income update was not applied.");
      }
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    return ok("Bulk income update saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not bulk update income entries."));
  }
}

export async function bulkDeleteIncomeEntriesAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return err("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) return err("Select at least one income entry.");

    const { error } = await supabase.from("income_lines").delete().in("id", ids);
    if (error) return err(error.message);

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    return ok("Selected income entries deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete selected income entries."));
  }
}

export type { ActionState };
