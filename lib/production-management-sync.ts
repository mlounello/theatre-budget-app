import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const productionManagementGuestArtistSyncEnabled =
  process.env.ENABLE_PRODUCTION_MANAGEMENT_GUEST_ARTIST_SYNC === "true";

type GuestArtistReconciliation = {
  status?: string;
  person_id?: string;
  match?: string;
};

export async function reconcileGuestArtistWithProductionManagement(guestArtistId: string): Promise<{
  status: "disabled" | "synced" | "attention";
  detail: string;
}> {
  if (!productionManagementGuestArtistSyncEnabled) {
    return { status: "disabled", detail: "Production Management guest-artist sync is disabled." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .schema("app_production_management")
    .rpc("reconcile_theatre_budget_guest_artist", { target_guest_artist_id: guestArtistId });

  if (error) return { status: "attention", detail: error.message };

  const result = (data ?? {}) as GuestArtistReconciliation;
  if (["created", "linked", "updated", "disabled"].includes(String(result.status ?? ""))) {
    return { status: "synced", detail: String(result.status) };
  }

  return {
    status: "attention",
    detail: String(result.status ?? "Guest artist reconciliation returned an unknown result.")
  };
}
