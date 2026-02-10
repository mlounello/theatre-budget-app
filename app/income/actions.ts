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
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!organizationId) throw new Error("Organization is required.");
    if (amount <= 0) throw new Error("Amount must be greater than 0.");

    const lineName = lineNameInput || defaultLineName(incomeType);

    const withType = await supabase.from("income_lines").insert({
      organization_id: organizationId,
      project_id: null,
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
    const incomeType = parseIncomeType(String(formData.get("incomeType") ?? "other"));
    const lineNameInput = String(formData.get("lineName") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const receivedOn = String(formData.get("receivedOn") ?? "").trim();

    if (!id) throw new Error("Income entry id is required.");
    if (!organizationId) throw new Error("Organization is required.");
    if (amount <= 0) throw new Error("Amount must be greater than 0.");

    const lineName = lineNameInput || defaultLineName(incomeType);

    const withType = await supabase
      .from("income_lines")
      .update({
        organization_id: organizationId,
        project_id: null,
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
