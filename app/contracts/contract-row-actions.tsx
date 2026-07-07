"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteContractAction, updateContractDetailsAction, type ActionState } from "@/app/contracts/actions";
import { SensitiveTextInput } from "@/components/sensitive-text-input";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import type {
  AccountCodeOption,
  ContractInstallmentRow,
  ContractRow,
  FiscalYearOption,
  FoapalOption,
  GuestArtistOption,
  OrganizationOption,
  ProcurementProjectOption
} from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function ContractRowActions({
  contract,
  installments,
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions,
  foapalOptions,
  guestArtistOptions
}: {
  contract: ContractRow;
  installments: ContractInstallmentRow[];
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  foapalOptions: FoapalOption[];
  guestArtistOptions: GuestArtistOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updateState, updateAction] = useActionState(updateContractDetailsAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteContractAction, initialState);

  const open = useMemo(() => searchParams.get("ct_edit") === contract.id, [searchParams, contract.id]);
  const [editProjectId, setEditProjectId] = useState(contract.projectId);
  const [editFiscalYearId, setEditFiscalYearId] = useState(contract.fiscalYearId ?? "");
  const [editOrganizationId, setEditOrganizationId] = useState(contract.organizationId ?? "");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState(contract.bannerAccountCodeId ?? "");
  const [editGuestArtistId, setEditGuestArtistId] = useState(contract.guestArtistId ?? "");
  const [editContractorName, setEditContractorName] = useState(contract.contractorName ?? "");
  const [editContractorEmployeeId, setEditContractorEmployeeId] = useState(contract.contractorEmployeeId ?? "");
  const [editContractorEmail, setEditContractorEmail] = useState(contract.contractorEmail ?? "");
  const [editContractorPhone, setEditContractorPhone] = useState(contract.contractorPhone ?? "");
  const [editContractValue, setEditContractValue] = useState(String(contract.contractValue ?? 0));
  const [editInstallmentCount, setEditInstallmentCount] = useState(String(contract.installmentCount ?? 1));
  const [editContractNumber, setEditContractNumber] = useState(contract.contractNumber ?? "");
  const [editContractRole, setEditContractRole] = useState(contract.contractRole ?? "");
  const [editFoapalId, setEditFoapalId] = useState(contract.checkRequestFoapalId ?? "");
  const [editHandling, setEditHandling] = useState(contract.checkRequestHandling ?? "mail");
  const [editOtherLocation, setEditOtherLocation] = useState(contract.checkRequestOtherLocation ?? "");
  const [editVendorAddress1, setEditVendorAddress1] = useState(contract.vendorAddress1 ?? "");
  const [editVendorAddress2, setEditVendorAddress2] = useState(contract.vendorAddress2 ?? "");
  const [editVendorAddress3, setEditVendorAddress3] = useState(contract.vendorAddress3 ?? "");
  const [editDueDates, setEditDueDates] = useState<Record<number, string>>({});
  const [editNotes, setEditNotes] = useState(contract.notes ?? "");
  const lastEditIdRef = useRef<string | null>(null);

  const openEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ct_edit", contract.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [contract.id, pathname, router, searchParams]);

  const closeEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ct_edit");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) {
      lastEditIdRef.current = null;
      return;
    }
    if (lastEditIdRef.current === contract.id) return;
    lastEditIdRef.current = contract.id;
    setEditProjectId(contract.projectId);
    setEditFiscalYearId(contract.fiscalYearId ?? "");
    setEditOrganizationId(contract.organizationId ?? "");
    setEditBannerAccountCodeId(contract.bannerAccountCodeId ?? "");
    setEditGuestArtistId(contract.guestArtistId ?? "");
    setEditContractorName(contract.contractorName ?? "");
    setEditContractorEmployeeId(contract.contractorEmployeeId ?? "");
    setEditContractorEmail(contract.contractorEmail ?? "");
    setEditContractorPhone(contract.contractorPhone ?? "");
    setEditContractValue(String(contract.contractValue ?? 0));
    setEditInstallmentCount(String(contract.installmentCount ?? 1));
    setEditContractNumber(contract.contractNumber ?? "");
    setEditContractRole(contract.contractRole ?? "");
    setEditFoapalId(contract.checkRequestFoapalId ?? "");
    setEditHandling(contract.checkRequestHandling ?? "mail");
    setEditOtherLocation(contract.checkRequestOtherLocation ?? "");
    setEditVendorAddress1(contract.vendorAddress1 ?? "");
    setEditVendorAddress2(contract.vendorAddress2 ?? "");
    setEditVendorAddress3(contract.vendorAddress3 ?? "");
    setEditDueDates(Object.fromEntries(installments.map((installment) => [installment.installmentNumber, installment.dueDate ?? ""])));
    setEditNotes(contract.notes ?? "");
  }, [open, contract, installments]);

  useEffect(() => {
    if (!deleteState.ok || !deleteState.message) return;
    if (open) closeEdit();
  }, [deleteState, open, closeEdit]);

  function applyGuestArtist(nextGuestArtistId: string) {
    setEditGuestArtistId(nextGuestArtistId);
    const guestArtist = guestArtistOptions.find((artist) => artist.id === nextGuestArtistId);
    if (!guestArtist) return;
    setEditContractorName(guestArtist.displayName);
    setEditContractorEmployeeId(guestArtist.vendorNumber ?? "");
    setEditContractorEmail(guestArtist.email ?? "");
    setEditContractorPhone(guestArtist.phone ?? "");
    setEditFoapalId(guestArtist.defaultFoapalId ?? "");
    setEditHandling(guestArtist.defaultCheckRequestHandling);
    setEditOtherLocation(guestArtist.defaultCheckRequestOtherLocation ?? "");
    setEditVendorAddress1(guestArtist.vendorAddress1 ?? "");
    setEditVendorAddress2(guestArtist.vendorAddress2 ?? "");
    setEditVendorAddress3(guestArtist.vendorAddress3 ?? "");
  }

  return (
    <>
      <div className="actionCell">
        <button type="button" className="tinyButton" onClick={openEdit}>
          Edit
        </button>
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm("Delete this contract and all linked installment rows? This cannot be undone.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="contractId" value={contract.id} />
          <button type="submit" className="tinyButton dangerButton">
            Trash
          </button>
        </form>
      </div>

      {open ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit contract">
          <div className="modalPanel">
            <h2>Edit Contract</h2>
            <p className="heroSubtitle">
              {contract.projectName}
              {contract.season ? ` (${contract.season})` : ""}
            </p>
            {updateState.message ? (
              <p className={updateState.ok ? "successNote" : "errorNote"} key={updateState.timestamp}>
                {updateState.message}
              </p>
            ) : null}
            {deleteState.message ? (
              <p className={deleteState.ok ? "successNote" : "errorNote"} key={deleteState.timestamp}>
                {deleteState.message}
              </p>
            ) : null}
            <form action={updateAction} className="requestForm">
              <input type="hidden" name="contractId" value={contract.id} />
              <label>
                Guest Artist Profile
                <select name="guestArtistId" value={editGuestArtistId} onChange={(event) => applyGuestArtist(event.target.value)}>
                  <option value="">Manual entry</option>
                  {guestArtistOptions
                    .filter((artist) => artist.active || artist.id === editGuestArtistId)
                    .map((artist) => (
                      <option key={artist.id} value={artist.id}>
                        {artist.displayName}
                        {artist.taxIdLast4 ? ` (Tax ID ending ${artist.taxIdLast4})` : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Name
                <input
                  name="contractorName"
                  value={editContractorName}
                  onChange={(event) => setEditContractorName(event.target.value)}
                  required
                />
              </label>
              <label>
                Employee ID
                <input
                  name="contractorEmployeeId"
                  value={editContractorEmployeeId}
                  onChange={(event) => setEditContractorEmployeeId(event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  name="contractorEmail"
                  type="email"
                  value={editContractorEmail}
                  onChange={(event) => setEditContractorEmail(event.target.value)}
                />
              </label>
              <label>
                Phone
                <input
                  name="contractorPhone"
                  value={editContractorPhone}
                  onChange={(event) => setEditContractorPhone(event.target.value)}
                />
              </label>
              <label>
                Contract Value
                <input
                  name="contractValue"
                  type="number"
                  step="0.01"
                  value={editContractValue}
                  onChange={(event) => setEditContractValue(event.target.value)}
                  required
                />
              </label>
              <label>
                Payment Installments
                <select
                  name="installmentCount"
                  value={editInstallmentCount}
                  onChange={(event) => setEditInstallmentCount(event.target.value)}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label>
                Contract Number
                <input
                  name="contractNumber"
                  value={editContractNumber}
                  onChange={(event) => setEditContractNumber(event.target.value)}
                />
              </label>
              <label>
                Role
                <input name="contractRole" value={editContractRole} onChange={(event) => setEditContractRole(event.target.value)} />
              </label>
              <label>
                Check Request FOAPAL
                <select name="checkRequestFoapalId" value={editFoapalId} onChange={(event) => setEditFoapalId(event.target.value)}>
                  <option value="">Use contract organization only</option>
                  {foapalOptions.map((foapal) => (
                    <option key={foapal.id} value={foapal.id}>
                      {foapal.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Check Delivery
                <select
                  name="checkRequestHandling"
                  value={editHandling}
                  onChange={(event) => setEditHandling(event.target.value as "mail" | "business_affairs_pickup" | "other")}
                >
                  <option value="mail">Mail check</option>
                  <option value="business_affairs_pickup">Pick up in Business Affairs</option>
                  <option value="other">Other location</option>
                </select>
              </label>
              <label>
                Other Pickup Location
                <input
                  name="checkRequestOtherLocation"
                  value={editOtherLocation}
                  onChange={(event) => setEditOtherLocation(event.target.value)}
                />
              </label>
              <label>
                Vendor Address Line 1
                <input
                  name="vendorAddress1"
                  value={editVendorAddress1}
                  onChange={(event) => setEditVendorAddress1(event.target.value)}
                />
              </label>
              <label>
                Vendor Address Line 2
                <input
                  name="vendorAddress2"
                  value={editVendorAddress2}
                  onChange={(event) => setEditVendorAddress2(event.target.value)}
                />
              </label>
              <label>
                Vendor Address Line 3
                <input
                  name="vendorAddress3"
                  value={editVendorAddress3}
                  onChange={(event) => setEditVendorAddress3(event.target.value)}
                />
              </label>
              <label>
                Tax ID / SSN
                <SensitiveTextInput name="taxIdOrSsn" placeholder="Leave blank to keep saved value" />
                <span className="helperText">
                  {contract.taxIdLast4 ? `Saved encrypted value ending in ${contract.taxIdLast4}. ` : ""}
                  Saving this contract overwrites all installment check-request snapshots.
                </span>
              </label>
              <label className="checkboxLabel">
                <input name="clearTaxId" type="checkbox" /> Clear saved Tax ID / SSN
              </label>
              <div className="contractInstallmentDates">
                {Array.from({ length: Number(editInstallmentCount) || 1 }, (_, index) => {
                  const installmentNumber = index + 1;
                  const dueDate = editDueDates[installmentNumber] ?? "";
                  const schedule = calculateCheckRequestSchedule(dueDate);
                  return (
                    <label key={installmentNumber}>
                      Installment {installmentNumber} Due Date
                      <input
                        name={`installmentDueDate${installmentNumber}`}
                        type="date"
                        value={dueDate}
                        onChange={(event) =>
                          setEditDueDates((previous) => ({ ...previous, [installmentNumber]: event.target.value }))
                        }
                      />
                      {schedule ? (
                        <span className="helperText">
                          Mail by {schedule.mailBy}; AP needs it by {schedule.apReceiveBy}; check run {schedule.checkRunDate}.
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <label>
                FY
                <select
                  name="fiscalYearId"
                  value={editFiscalYearId}
                  onChange={(event) => setEditFiscalYearId(event.target.value)}
                >
                  <option value="">From project default</option>
                  {fiscalYearOptions.map((fiscalYear) => (
                    <option key={fiscalYear.id} value={fiscalYear.id}>
                      {fiscalYear.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Org
                <select
                  name="organizationId"
                  value={editOrganizationId}
                  onChange={(event) => setEditOrganizationId(event.target.value)}
                >
                  <option value="">From project default</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project
                <select
                  name="projectId"
                  value={editProjectId}
                  onChange={(event) => setEditProjectId(event.target.value)}
                  required
                >
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Account
                <select
                  name="bannerAccountCodeId"
                  value={editBannerAccountCodeId}
                  onChange={(event) => setEditBannerAccountCodeId(event.target.value)}
                  required
                >
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <input name="notes" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={closeEdit}>
                  Close
                </button>
                <button type="submit" className="tinyButton">
                  Save Edit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
