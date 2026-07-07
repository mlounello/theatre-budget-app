"use client";

import { useActionState } from "react";
import { createGuestArtistAction, updateGuestArtistAction, type ActionState } from "@/app/guest-artists/actions";
import type { FoapalOption, GuestArtistOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function Notice({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
      {state.message}
    </p>
  );
}

function GuestArtistFields({
  artist,
  foapalOptions
}: {
  artist?: GuestArtistOption;
  foapalOptions: FoapalOption[];
}) {
  return (
    <>
      <label>
        Name
        <input name="displayName" defaultValue={artist?.displayName ?? ""} required />
      </label>
      <label>
        Vendor / Employee Number
        <input name="vendorNumber" defaultValue={artist?.vendorNumber ?? ""} />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={artist?.email ?? ""} />
      </label>
      <label>
        Phone
        <input name="phone" defaultValue={artist?.phone ?? ""} />
      </label>
      <label>
        Default FOAPAL
        <select name="defaultFoapalId" defaultValue={artist?.defaultFoapalId ?? ""}>
          <option value="">No default</option>
          {foapalOptions.map((foapal) => (
            <option key={foapal.id} value={foapal.id}>
              {foapal.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Default Check Delivery
        <select name="defaultCheckRequestHandling" defaultValue={artist?.defaultCheckRequestHandling ?? "mail"}>
          <option value="mail">Mail check</option>
          <option value="business_affairs_pickup">Pick up in Business Affairs</option>
          <option value="other">Other location</option>
        </select>
      </label>
      <label>
        Other Pickup Location
        <input name="defaultCheckRequestOtherLocation" defaultValue={artist?.defaultCheckRequestOtherLocation ?? ""} />
      </label>
      <label>
        Address Line 1
        <input name="vendorAddress1" defaultValue={artist?.vendorAddress1 ?? ""} />
      </label>
      <label>
        Address Line 2
        <input name="vendorAddress2" defaultValue={artist?.vendorAddress2 ?? ""} />
      </label>
      <label>
        Address Line 3
        <input name="vendorAddress3" defaultValue={artist?.vendorAddress3 ?? ""} />
      </label>
      <label>
        Tax ID / SSN
        <input name="taxIdOrSsn" type="password" autoComplete="off" placeholder={artist ? "Leave blank to keep saved value" : ""} />
        <span className="helperText">
          {artist?.taxIdLast4 ? `Saved encrypted value ending in ${artist.taxIdLast4}. ` : ""}
          Stored encrypted and copied to contract snapshots only on save.
        </span>
      </label>
      {artist ? (
        <label className="checkboxLabel">
          <input name="clearTaxId" type="checkbox" /> Clear saved Tax ID / SSN
        </label>
      ) : null}
      <label>
        Notes
        <input name="notes" defaultValue={artist?.notes ?? ""} />
      </label>
      <label>
        Status
        <select name="active" defaultValue={artist?.active === false ? "false" : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </label>
    </>
  );
}

function GuestArtistEditCard({ artist, foapalOptions }: { artist: GuestArtistOption; foapalOptions: FoapalOption[] }) {
  const [state, action] = useActionState(updateGuestArtistAction, initialState);
  return (
    <details className="panel nestedPanel">
      <summary>
        <strong>{artist.displayName}</strong>
        <span className="muted"> {artist.active ? "Active" : "Inactive"}</span>
      </summary>
      <form action={action} className="requestForm">
        <input type="hidden" name="guestArtistId" value={artist.id} />
        <Notice state={state} />
        <GuestArtistFields artist={artist} foapalOptions={foapalOptions} />
        <button type="submit" className="buttonLink buttonPrimary">
          Save Profile
        </button>
      </form>
    </details>
  );
}

export function GuestArtistManager({
  guestArtists,
  foapalOptions
}: {
  guestArtists: GuestArtistOption[];
  foapalOptions: FoapalOption[];
}) {
  const [createState, createAction] = useActionState(createGuestArtistAction, initialState);
  return (
    <>
      <article className="panel requestFormPanel">
        <h2>Add Guest Artist</h2>
        <form action={createAction} className="requestForm">
          <Notice state={createState} />
          <GuestArtistFields foapalOptions={foapalOptions} />
          <button type="submit" className="buttonLink buttonPrimary">
            Save Guest Artist
          </button>
        </form>
      </article>

      <article className="panel tablePanel">
        <h2>Guest Artist Profiles</h2>
        <div className="stackedDetails">
          {guestArtists.length === 0 ? (
            <p>No guest artists yet.</p>
          ) : (
            guestArtists.map((artist) => <GuestArtistEditCard key={artist.id} artist={artist} foapalOptions={foapalOptions} />)
          )}
        </div>
      </article>
    </>
  );
}
