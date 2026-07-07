import { redirect } from "next/navigation";
import { GuestArtistManager } from "@/app/guest-artists/guest-artist-manager";
import { getAccessContext } from "@/lib/access";
import { getFoapalOptions, getGuestArtistOptions } from "@/lib/db";

export default async function GuestArtistsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const [guestArtists, foapalOptions] = await Promise.all([getGuestArtistOptions(), getFoapalOptions()]);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Contracts</p>
        <h1>Guest Artists</h1>
        <p className="heroSubtitle">Reusable payee profiles for contract check requests.</p>
      </header>

      <GuestArtistManager guestArtists={guestArtists} foapalOptions={foapalOptions} />
    </section>
  );
}
