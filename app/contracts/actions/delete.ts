"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { type ActionState, emptyState, ok, err, getErrorMessage } from "@/lib/action-helpers";
import { ensurePmOrAdmin } from "@/app/contracts/actions/_shared";

export async function deleteContractAction(
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

    const contractId = String(formData.get("contractId") ?? "").trim();
    if (!contractId) return err("Contract id is required.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) return err("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { error: deleteError } = await supabase.rpc("delete_contract_with_links", {
      p_contract_id: contractId
    });
    if (deleteError) return err(deleteError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok("Contract deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete contract."));
  }
}
