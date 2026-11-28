"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type ActionState, emptyState, getErrorMessage } from "@/lib/action-helpers";
import { requireSettingsAdmin, requiredText, settingsSuccess, settingsError } from "@/app/settings/actions/_shared";

export async function createFundAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const code = requiredText(formData, "fundCode", "Fund code");
    const name = requiredText(formData, "fundName", "Fund name");

    const { error } = await supabase.from("funds").insert({
      code,
      name,
      active: true
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Fund created.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not create fund."));
  }
}

export async function createProgramAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const code = requiredText(formData, "programCode", "Program code");
    const name = requiredText(formData, "programName", "Program name");

    const { error } = await supabase.from("programs").insert({
      code,
      name,
      active: true
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("Program created.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not create program."));
  }
}

export async function createFoapalAction(_prevState: ActionState = emptyState, formData: FormData): Promise<ActionState> {
  void _prevState;
  try {
    await requireSettingsAdmin();
    const supabase = await getSupabaseServerClient();
    const fundId = requiredText(formData, "fundId", "Fund");
    const organizationId = requiredText(formData, "organizationId", "Organization");
    const programId = requiredText(formData, "programId", "Program");
    const label = String(formData.get("foapalLabel") ?? "").trim();

    const { error } = await supabase.from("foapals").insert({
      fund_id: fundId,
      organization_id: organizationId,
      program_id: programId,
      label: label || null,
      active: true
    });
    if (error) throw new Error(error.message);

    revalidatePath("/settings");
    return settingsSuccess("FOAPAL created.");
  } catch (error) {
    return settingsError(getErrorMessage(error, "Could not create FOAPAL."));
  }
}
