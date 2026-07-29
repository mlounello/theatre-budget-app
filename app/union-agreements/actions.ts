"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/access";
import { encryptSensitiveValue, taxIdLastFour } from "@/lib/sensitive-encryption";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type UnionActionState = { ok: boolean; message: string; timestamp: number };
const emptyState: UnionActionState = { ok: true, message: "", timestamp: 0 };

function result(ok: boolean, message: string): UnionActionState {
  return { ok, message, timestamp: Date.now() };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function requireManager(): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role !== "admin" && access.role !== "project_manager") {
    throw new Error("Only Admin or Project Manager can manage union agreements.");
  }
}

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function handling(formData: FormData): "mail" | "business_affairs_pickup" | "other" {
  const value = String(formData.get("checkRequestHandling") ?? "mail");
  return value === "business_affairs_pickup" || value === "other" ? value : "mail";
}

export async function saveUnionFundAction(
  previous: UnionActionState = emptyState,
  formData: FormData
): Promise<UnionActionState> {
  void previous;
  try {
    await requireManager();
    const supabase = await getSupabaseServerClient();
    const id = text(formData, "unionFundId");
    const name = text(formData, "name");
    if (!name) return result(false, "Fund payee name is required.");

    let existingTax: { encrypted: string | null; last4: string | null } | undefined;
    if (id) {
      const { data, error } = await supabase
        .from("union_funds")
        .select("tax_id_encrypted, tax_id_last4")
        .eq("id", id)
        .single();
      if (error) return result(false, error.message);
      existingTax = {
        encrypted: (data.tax_id_encrypted as string | null) ?? null,
        last4: (data.tax_id_last4 as string | null) ?? null
      };
    }

    const rawTax = String(formData.get("taxIdOrSsn") ?? "").trim();
    const clearTax = formData.get("clearTaxId") === "on";
    const tax = clearTax
      ? { encrypted: null, last4: null }
      : rawTax
        ? { encrypted: encryptSensitiveValue(rawTax), last4: taxIdLastFour(rawTax) }
        : existingTax ?? { encrypted: null, last4: null };
    const payload = {
      name,
      vendor_number: text(formData, "vendorNumber"),
      foapal_id: text(formData, "foapalId"),
      check_request_handling: handling(formData),
      check_request_other_location: text(formData, "checkRequestOtherLocation"),
      vendor_address1: text(formData, "vendorAddress1"),
      vendor_address2: text(formData, "vendorAddress2"),
      vendor_address3: text(formData, "vendorAddress3"),
      tax_id_encrypted: tax.encrypted,
      tax_id_last4: tax.last4,
      notes: text(formData, "notes"),
      active: formData.get("active") !== "false",
      updated_at: new Date().toISOString()
    };

    const query = id
      ? supabase.from("union_funds").update(payload).eq("id", id)
      : supabase.from("union_funds").insert(payload);
    const { error } = await query;
    if (error) return result(false, error.message);
    revalidatePath("/union-agreements");
    revalidatePath("/contracts");
    return result(true, id ? "Union fund profile updated." : "Union fund profile created.");
  } catch (error) {
    return result(false, errorMessage(error, "Could not save union fund profile."));
  }
}

export async function saveUnionAgreementAction(
  previous: UnionActionState = emptyState,
  formData: FormData
): Promise<UnionActionState> {
  void previous;
  try {
    await requireManager();
    const supabase = await getSupabaseServerClient();
    const id = text(formData, "unionAgreementId");
    const name = text(formData, "name");
    const unionName = text(formData, "unionName");
    const versionLabel = text(formData, "versionLabel");
    if (!name || !unionName || !versionLabel) {
      return result(false, "Agreement name, union name, and version are required.");
    }

    const rules = Array.from({ length: 8 }, (_, index) => {
      const unionFundId = text(formData, `fundId_${index}`);
      const percentage = Number.parseFloat(String(formData.get(`percentage_${index}`) ?? ""));
      const rawType = String(formData.get(`contributionType_${index}`) ?? "employer_paid");
      return unionFundId && Number.isFinite(percentage) && percentage >= 0
        ? {
            union_fund_id: unionFundId,
            percentage,
            contribution_type: rawType === "artist_withholding" ? "artist_withholding" : "employer_paid",
            sort_order: index
          }
        : null;
    }).filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
    if (rules.length === 0) return result(false, "Add at least one fund percentage to the agreement.");
    if (new Set(rules.map((rule) => rule.union_fund_id)).size !== rules.length) {
      return result(false, "Each union fund can appear only once in an agreement.");
    }

    const agreementPayload = {
      name,
      union_name: unionName,
      version_label: versionLabel,
      effective_from: text(formData, "effectiveFrom"),
      effective_to: text(formData, "effectiveTo"),
      notes: text(formData, "notes"),
      active: formData.get("active") !== "false",
      updated_at: new Date().toISOString()
    };
    let agreementId = id;
    if (id) {
      const { count, error: usageError } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("union_agreement_id", id);
      if (usageError) return result(false, usageError.message);
      if ((count ?? 0) > 0) {
        return result(false, "This agreement version is already used by a contract. Create a new version instead.");
      }
      const { error } = await supabase.from("union_agreements").update(agreementPayload).eq("id", id);
      if (error) return result(false, error.message);
    } else {
      const { data, error } = await supabase
        .from("union_agreements")
        .insert(agreementPayload)
        .select("id")
        .single();
      if (error || !data) return result(false, error?.message ?? "Agreement was not created.");
      agreementId = data.id as string;
    }

    const { error: deleteError } = await supabase
      .from("union_agreement_funds")
      .delete()
      .eq("union_agreement_id", agreementId as string);
    if (deleteError) return result(false, deleteError.message);
    const { error: rulesError } = await supabase.from("union_agreement_funds").insert(
      rules.map((rule) => ({ ...rule, union_agreement_id: agreementId }))
    );
    if (rulesError) return result(false, rulesError.message);

    revalidatePath("/union-agreements");
    revalidatePath("/guest-artists");
    revalidatePath("/contracts");
    return result(true, id ? "Union agreement updated." : "Union agreement created.");
  } catch (error) {
    return result(false, errorMessage(error, "Could not save union agreement."));
  }
}
