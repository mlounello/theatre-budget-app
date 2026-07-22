"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/access";
import { encryptSensitiveValue, taxIdLastFour } from "@/lib/sensitive-encryption";
import { reconcileGuestArtistWithProductionManagement } from "@/lib/production-management-sync";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

async function requireGuestArtistManager(): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin" && access.role !== "project_manager") {
    throw new Error("Only Admin or Project Manager can manage guest artists.");
  }
}

function nullableText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

function parseHandling(value: FormDataEntryValue | null): "mail" | "business_affairs_pickup" | "other" {
  const raw = String(value ?? "mail").trim();
  if (raw === "business_affairs_pickup" || raw === "other") return raw;
  return "mail";
}

function parseTaxId(formData: FormData, existing?: { encrypted: string | null; last4: string | null }) {
  if (formData.get("clearTaxId") === "on") return { encrypted: null, last4: null };
  const value = String(formData.get("taxIdOrSsn") ?? "").trim();
  if (!value) return { encrypted: existing?.encrypted ?? null, last4: existing?.last4 ?? null };
  return {
    encrypted: encryptSensitiveValue(value),
    last4: taxIdLastFour(value)
  };
}

function profilePayload(formData: FormData, existingTax?: { encrypted: string | null; last4: string | null }) {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Guest artist name is required.");
  const tax = parseTaxId(formData, existingTax);
  return {
    display_name: displayName,
    vendor_number: nullableText(formData, "vendorNumber"),
    email: nullableText(formData, "email"),
    phone: nullableText(formData, "phone"),
    default_foapal_id: nullableText(formData, "defaultFoapalId"),
    default_check_request_handling: parseHandling(formData.get("defaultCheckRequestHandling")),
    default_check_request_other_location: nullableText(formData, "defaultCheckRequestOtherLocation"),
    vendor_address1: nullableText(formData, "vendorAddress1"),
    vendor_address2: nullableText(formData, "vendorAddress2"),
    vendor_address3: nullableText(formData, "vendorAddress3"),
    tax_id_encrypted: tax.encrypted,
    tax_id_last4: tax.last4,
    notes: nullableText(formData, "notes"),
    active: formData.get("active") !== "false",
    updated_at: new Date().toISOString()
  };
}

export async function createGuestArtistAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    await requireGuestArtistManager();
    const supabase = await getSupabaseServerClient();
    const payload = profilePayload(formData);
    const { data: created, error } = await supabase.from("guest_artists").insert(payload).select("id").single();
    if (error) return err(error.message);
    if (!created?.id) return err("Guest artist profile was not created.");

    const reconciliation = await reconcileGuestArtistWithProductionManagement(String(created.id));

    revalidatePath("/guest-artists");
    revalidatePath("/contracts");
    return ok(reconciliation.status === "attention"
      ? `Guest artist profile saved. Production Management sync needs attention: ${reconciliation.detail}`
      : "Guest artist profile saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save guest artist."));
  }
}

export async function updateGuestArtistAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    await requireGuestArtistManager();
    const supabase = await getSupabaseServerClient();
    const id = String(formData.get("guestArtistId") ?? "").trim();
    if (!id) return err("Guest artist id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("guest_artists")
      .select("id, tax_id_encrypted, tax_id_last4")
      .eq("id", id)
      .maybeSingle();
    if (existingError) return err(existingError.message);
    if (!existing?.id) return err("Guest artist profile not found.");

    const payload = profilePayload(formData, {
      encrypted: (existing.tax_id_encrypted as string | null) ?? null,
      last4: (existing.tax_id_last4 as string | null) ?? null
    });

    const { data: updated, error } = await supabase
      .from("guest_artists")
      .update(payload)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message);
    if (!updated?.id) return err("Guest artist update was not applied.");

    const reconciliation = await reconcileGuestArtistWithProductionManagement(String(updated.id));

    revalidatePath("/guest-artists");
    revalidatePath("/contracts");
    return ok(reconciliation.status === "attention"
      ? `Guest artist profile updated. Production Management sync needs attention: ${reconciliation.detail}`
      : "Guest artist profile updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update guest artist."));
  }
}
