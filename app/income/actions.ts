"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type IncomeType = "starting_budget" | "donation" | "ticket_sales" | "other";

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

function rethrowIfRedirect(error: unknown): void {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "";

  if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) {
    throw error;
  }
}

export async function createIncomeEntryAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!organizationId) throw new Error("Organization is required.");
    if (amount === 0) throw new Error("Amount must be non-zero.");

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
      if (fallback.error) throw new Error(fallback.error.message);
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    redirect("/income?ok=Income%20entry%20saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/income?error=${encodeURIComponent(getErrorMessage(error, "Could not save income entry."))}`);
  }
}

export async function updateIncomeEntryAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!id) throw new Error("Income entry id is required.");
    if (!organizationId) throw new Error("Organization is required.");
    if (amount === 0) throw new Error("Amount must be non-zero.");

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
      .eq("id", id);

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
        .eq("id", id);

      if (fallback.error) throw new Error(fallback.error.message);
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    redirect("/income?ok=Income%20entry%20updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/income?error=${encodeURIComponent(getErrorMessage(error, "Could not update income entry."))}`);
  }
}

export async function deleteIncomeEntryAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const id = String(formData.get("id") ?? "").trim();
    if (!id) throw new Error("Income entry id is required.");

    const { error } = await supabase.from("income_lines").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    redirect("/income?ok=Income%20entry%20deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/income?error=${encodeURIComponent(getErrorMessage(error, "Could not delete income entry."))}`);
  }
}

export async function bulkUpdateIncomeEntriesAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) throw new Error("Select at least one income entry.");

    const applyOrganization = formData.get("applyOrganization") === "on";
    const applyType = formData.get("applyIncomeType") === "on";
    const applyCategory = formData.get("applyProductionCategory") === "on";
    const applyBanner = formData.get("applyBannerAccountCode") === "on";
    const applyLineName = formData.get("applyLineName") === "on";
    const applyReference = formData.get("applyReferenceNumber") === "on";
    const applyAmount = formData.get("applyAmount") === "on";
    const applyReceivedOn = formData.get("applyReceivedOn") === "on";

    if (!applyOrganization && !applyType && !applyCategory && !applyBanner && !applyLineName && !applyReference && !applyAmount && !applyReceivedOn) {
      throw new Error("Choose at least one field to apply.");
    }

    const targetOrganizationId = String(formData.get("organizationId") ?? "").trim();
    const targetIncomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const targetProductionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const targetBannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const targetLineName = String(formData.get("lineName") ?? "").trim();
    const targetReferenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const targetAmount = parseMoney(formData.get("amount"));
    const targetReceivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (applyOrganization && !targetOrganizationId) throw new Error("Organization is required when applying organization.");
    if (applyAmount && targetAmount === 0) throw new Error("Amount must be non-zero when applying amount.");

    const { data: existingRows, error: existingError } = await supabase
      .from("income_lines")
      .select("id, organization_id, production_category_id, banner_account_code_id, income_type, line_name, reference_number, amount, received_on")
      .in("id", ids);
    if (existingError) throw new Error(existingError.message);
    if (!existingRows || existingRows.length !== ids.length) throw new Error("Some selected income entries were not found.");

    for (const row of existingRows) {
      const nextOrganizationId = applyOrganization ? targetOrganizationId : ((row.organization_id as string | null) ?? "");
      if (!nextOrganizationId) throw new Error("Organization cannot be empty.");

      const nextIncomeType = applyType ? targetIncomeType : parseIncomeType(String(row.income_type ?? "other"));
      const nextLineName = applyLineName
        ? targetLineName || defaultLineName(nextIncomeType)
        : (String(row.line_name ?? "").trim() || defaultLineName(nextIncomeType));
      const nextAmount = applyAmount ? targetAmount : Number(row.amount ?? 0);
      if (nextAmount === 0) throw new Error("Amount cannot be zero.");

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
        .eq("id", row.id as string);

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
          .eq("id", row.id as string);
        if (fallback.error) throw new Error(fallback.error.message);
      }
    }

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    redirect("/income?ok=Bulk%20income%20update%20saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/income?error=${encodeURIComponent(getErrorMessage(error, "Could not bulk update income entries."))}`);
  }
}

export async function bulkDeleteIncomeEntriesAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    const ids = parseIdsJson(formData.get("selectedIdsJson"));
    if (ids.length === 0) throw new Error("Select at least one income entry.");

    const { error } = await supabase.from("income_lines").delete().in("id", ids);
    if (error) throw new Error(error.message);

    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath("/income");
    redirect("/income?ok=Selected%20income%20entries%20deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/income?error=${encodeURIComponent(getErrorMessage(error, "Could not delete selected income entries."))}`);
  }
}
