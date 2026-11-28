"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { type ActionState, emptyState, ok, err, getErrorMessage } from "@/lib/action-helpers";
import { requireCcManagerRole } from "@/app/cc/actions/_shared";

function revalidateExpenseViews(): void {
  revalidatePath("/cc");
  revalidatePath("/");
  revalidatePath("/procurement");
  revalidatePath("/institutional-budget");
}

async function signedInUserId(): Promise<{ supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>; userId: string } | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

/** Correct the EX number and title of an Expense inside a claim. */
export async function adjustExpenseDetailsAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const session = await signedInUserId();
    if (!session) return err("You must be signed in.");
    await requireCcManagerRole();

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const expenseNumber = String(formData.get("expenseNumber") ?? "").trim().toUpperCase();
    const title = String(formData.get("title") ?? "").trim();
    if (!purchaseId) return err("Expense is required.");
    if (!/^EX[0-9]{6}$/.test(expenseNumber)) return err("Expense number must use EX######.");
    if (!title) return err("Title is required.");

    const { data, error } = await session.supabase.rpc("adjust_expense_details", {
      p_purchase_id: purchaseId,
      p_expense_number: expenseNumber,
      p_title: title,
      p_user_id: session.userId
    });
    if (error) return err(error.message);

    revalidateExpenseViews();
    const result = data as { changed?: boolean } | null;
    return ok(result?.changed === false ? "No changes to save." : `${expenseNumber} updated.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not update the Expense."));
  }
}

/** Detach an Expense from its claim and attach it to another EC (an existing one, or a new one for the same card and month). */
export async function moveExpenseToClaimAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const session = await signedInUserId();
    if (!session) return err("You must be signed in.");
    await requireCcManagerRole();

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const claimNumber = String(formData.get("claimNumber") ?? "").trim().toUpperCase();
    if (!purchaseId) return err("Expense is required.");
    if (!/^EC[0-9]{6}$/.test(claimNumber)) return err("Expense Claim number must use EC######.");

    const { data, error } = await session.supabase.rpc("move_expense_to_claim", {
      p_purchase_id: purchaseId,
      p_claim_number: claimNumber,
      p_user_id: session.userId
    });
    if (error) return err(error.message);

    revalidateExpenseViews();
    const result = data as { moved?: boolean; created_claim?: boolean; from_claim_number?: string } | null;
    if (result?.moved === false) return ok("That Expense is already in this claim.");
    return ok(
      `Moved to ${claimNumber}${result?.created_claim ? " (new claim created for the same card and month)" : ""}.`
    );
  } catch (error) {
    return err(getErrorMessage(error, "Could not move the Expense."));
  }
}

/** Delete an Expense and return its receipts to the staged pool so they can be corrected and re-finalized. */
export async function deleteExpenseAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const session = await signedInUserId();
    if (!session) return err("You must be signed in.");
    await requireCcManagerRole();

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    if (!purchaseId) return err("Expense is required.");
    if (String(formData.get("confirmDelete") ?? "") !== "yes") return err("Confirm the deletion before continuing.");

    const { data, error } = await session.supabase.rpc("delete_expense_restage_receipts", {
      p_purchase_id: purchaseId,
      p_user_id: session.userId
    });
    if (error) return err(error.message);

    const result = data as {
      expense_number?: string;
      restaged_receipts?: number;
      discarded_receipts?: number;
      authorization_purchase_id?: string | null;
    } | null;

    let commitmentWarning = false;
    if (result?.authorization_purchase_id) {
      try {
        await createInstitutionalCommitmentForPurchase(session.supabase, result.authorization_purchase_id, session.userId);
      } catch (syncError) {
        commitmentWarning = true;
        console.error("Expense deletion commitment sync failed", { authorization: result.authorization_purchase_id, syncError });
      }
    }

    revalidateExpenseViews();
    const restaged = Number(result?.restaged_receipts ?? 0);
    const discarded = Number(result?.discarded_receipts ?? 0);
    return ok(
      `${result?.expense_number ?? "Expense"} deleted.` +
        (restaged > 0 ? ` ${restaged} receipt${restaged === 1 ? "" : "s"} returned to the staged pool.` : "") +
        (discarded > 0 ? ` ${discarded} attached receipt${discarded === 1 ? " was" : "s were"} removed with it.` : "") +
        (commitmentWarning ? " The funding request commitment needs review." : "")
    );
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete the Expense."));
  }
}
