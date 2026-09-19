"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteContractAction, updateContractDetailsAction, type ActionState } from "@/app/contracts/actions";
import { SensitiveTextInput } from "@/components/sensitive-text-input";
import { AccordionSection } from "@/components/ui/accordion-section";
import { ActionNotice } from "@/components/ui/action-notice";
import { ConfirmationDialog } from "@/components/ui/modal-dialog";
import { SideDrawer } from "@/components/ui/side-drawer";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import type {
  AccountCodeOption,
  ContractInstallmentRow,
  ContractRow,
  ContractUnionContributionRow,
  FiscalYearOption,
  FoapalOption,
  GuestArtistOption,
  OrganizationOption,
  ProcurementProjectOption,
  UnionAgreementOption
} from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };
type DrawerSection = "artist" | "union" | "payment" | "accounting" | "notes";

export function ContractRowActions({
  contract,
  installments,
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions,
  foapalOptions,
  guestArtistOptions,
  unionAgreementOptions,
  unionContributions
}: {
  contract: ContractRow;
  installments: ContractInstallmentRow[];
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  foapalOptions: FoapalOption[];
  guestArtistOptions: GuestArtistOption[];
  unionAgreementOptions: UnionAgreementOption[];
  unionContributions: ContractUnionContributionRow[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updateState, updateAction] = useActionState(updateContractDetailsAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteContractAction, initialState);

  const open = useMemo(() => searchParams.get("ct_edit") === contract.id, [searchParams, contract.id]);
  const [editProjectId, setEditProjectId] = useState(contract.projectId);
  const [editProductionProjectIds, setEditProductionProjectIds] = useState(
    contract.productionProjects.map((project) => project.id)
  );
  const [editFiscalYearId, setEditFiscalYearId] = useState(contract.fiscalYearId ?? "");
  const [editOrganizationId, setEditOrganizationId] = useState(contract.organizationId ?? "");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState(contract.bannerAccountCodeId ?? "");
  const [editGuestArtistId, setEditGuestArtistId] = useState(contract.guestArtistId ?? "");
  const [editContractorName, setEditContractorName] = useState(contract.contractorName ?? "");
  const [editContractorEmployeeId, setEditContractorEmployeeId] = useState(contract.contractorEmployeeId ?? "");
  const [editContractorEmail, setEditContractorEmail] = useState(contract.contractorEmail ?? "");
  const [editContractorPhone, setEditContractorPhone] = useState(contract.contractorPhone ?? "");
  const [editContractValue, setEditContractValue] = useState(String(contract.contractValue ?? 0));
  const [editEngagementType, setEditEngagementType] = useState(contract.engagementType);
  const [editCompensationBasis, setEditCompensationBasis] = useState(contract.compensationBasis);
  const [editHrOnboardingStatus, setEditHrOnboardingStatus] = useState(contract.hrOnboardingStatus);
  const [editHrOnboardingReference, setEditHrOnboardingReference] = useState(contract.hrOnboardingReference ?? "");
  const [editInstallmentCount, setEditInstallmentCount] = useState(String(contract.installmentCount ?? 1));
  const [editContractNumber, setEditContractNumber] = useState(contract.contractNumber ?? "");
  const [editContractRole, setEditContractRole] = useState(contract.contractRole ?? "");
  const [editIsUnion, setEditIsUnion] = useState(contract.isUnion);
  const [editUnionAgreementId, setEditUnionAgreementId] = useState(contract.unionAgreementId ?? "");
  const [editUnionDueDates, setEditUnionDueDates] = useState<Record<string, string>>(
    Object.fromEntries(
      unionContributions.map((contribution) => [
        unionAgreementOptions
          .flatMap((agreement) => agreement.funds)
          .find((fund) => fund.fundName === contribution.fundName)?.id ?? contribution.id,
        contribution.dueDate ?? ""
      ])
    )
  );
  const [editContractSessions, setEditContractSessions] = useState<string[]>(contract.contractSessions);
  const [editFoapalId, setEditFoapalId] = useState(contract.checkRequestFoapalId ?? "");
  const [editHandling, setEditHandling] = useState(contract.checkRequestHandling ?? "mail");
  const [editOtherLocation, setEditOtherLocation] = useState(contract.checkRequestOtherLocation ?? "");
  const [editVendorAddress1, setEditVendorAddress1] = useState(contract.vendorAddress1 ?? "");
  const [editVendorAddress2, setEditVendorAddress2] = useState(contract.vendorAddress2 ?? "");
  const [editVendorAddress3, setEditVendorAddress3] = useState(contract.vendorAddress3 ?? "");
  const [editDueDates, setEditDueDates] = useState<Record<number, string>>({});
  const [editNotes, setEditNotes] = useState(contract.notes ?? "");
  const [openDrawerSection, setOpenDrawerSection] = useState<DrawerSection | null>("artist");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const lastEditIdRef = useRef<string | null>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const editAccountingProject = projectOptions.find((project) => project.id === editProjectId);
  const editContractFiscalYearId = editFiscalYearId || editAccountingProject?.fiscalYearId || "";
  const editAssociatedProjectOptions = useMemo(
    () => projectOptions.filter((project) => project.fiscalYearId === editContractFiscalYearId),
    [editContractFiscalYearId, projectOptions]
  );
  const editUnionAgreement = unionAgreementOptions.find((agreement) => agreement.id === editUnionAgreementId);
  const numericEditContractValue = Number.parseFloat(editContractValue) || 0;

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
    setOpenDrawerSection("artist");
    setEditProjectId(contract.projectId);
    setEditProductionProjectIds(contract.productionProjects.map((project) => project.id));
    setEditFiscalYearId(contract.fiscalYearId ?? "");
    setEditOrganizationId(contract.organizationId ?? "");
    setEditBannerAccountCodeId(contract.bannerAccountCodeId ?? "");
    setEditGuestArtistId(contract.guestArtistId ?? "");
    setEditContractorName(contract.contractorName ?? "");
    setEditContractorEmployeeId(contract.contractorEmployeeId ?? "");
    setEditContractorEmail(contract.contractorEmail ?? "");
    setEditContractorPhone(contract.contractorPhone ?? "");
    setEditContractValue(String(contract.contractValue ?? 0));
    setEditEngagementType(contract.engagementType);
    setEditCompensationBasis(contract.compensationBasis);
    setEditHrOnboardingStatus(contract.hrOnboardingStatus);
    setEditHrOnboardingReference(contract.hrOnboardingReference ?? "");
    setEditInstallmentCount(String(contract.installmentCount ?? 1));
    setEditContractNumber(contract.contractNumber ?? "");
    setEditContractRole(contract.contractRole ?? "");
    setEditIsUnion(contract.isUnion);
    setEditUnionAgreementId(contract.unionAgreementId ?? "");
    const contributionByFundName = new Map(unionContributions.map((contribution) => [contribution.fundName, contribution]));
    setEditUnionDueDates(
      Object.fromEntries(
        (unionAgreementOptions.find((agreement) => agreement.id === contract.unionAgreementId)?.funds ?? []).map((fund) => [
          fund.id,
          contributionByFundName.get(fund.fundName)?.dueDate ?? ""
        ])
      )
    );
    setEditContractSessions(contract.contractSessions);
    setEditFoapalId(contract.checkRequestFoapalId ?? "");
    setEditHandling(contract.checkRequestHandling ?? "mail");
    setEditOtherLocation(contract.checkRequestOtherLocation ?? "");
    setEditVendorAddress1(contract.vendorAddress1 ?? "");
    setEditVendorAddress2(contract.vendorAddress2 ?? "");
    setEditVendorAddress3(contract.vendorAddress3 ?? "");
    setEditDueDates(Object.fromEntries(installments.map((installment) => [installment.installmentNumber, installment.dueDate ?? ""])));
    setEditNotes(contract.notes ?? "");
  }, [open, contract, installments, unionAgreementOptions, unionContributions]);

  useEffect(() => {
    if (!deleteState.ok || !deleteState.message) return;
    if (open) closeEdit();
  }, [deleteState, open, closeEdit]);

  useEffect(() => {
    const allowedIds = new Set(editAssociatedProjectOptions.map((project) => project.id));
    setEditProductionProjectIds((current) => {
      const filtered = current.filter((id) => allowedIds.has(id));
      return filtered.length === current.length ? current : filtered;
    });
  }, [editAssociatedProjectOptions]);

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
    setEditIsUnion(guestArtist.isUnion);
    setEditEngagementType(guestArtist.isUnion ? "union_freelance_artist" : "independent_contractor");
    setEditUnionAgreementId(guestArtist.defaultUnionAgreementId ?? "");
    setEditUnionDueDates({});
  }

  function handleDrawerSectionToggle(section: DrawerSection, isOpen: boolean) {
    setOpenDrawerSection((current) => (isOpen ? section : current === section ? null : current));
  }

  return (
    <>
      <div className="contractCardActions">
        <button type="button" className="tinyButton" onClick={openEdit}>
          Edit
        </button>
      </div>

      <SideDrawer
        open={open}
        onClose={closeEdit}
        eyebrow="Edit Contract"
        title={contract.contractorName}
        description={`${contract.projectName}${contract.season ? ` (${contract.season})` : ""}`}
        closeLabel="Close edit contract drawer"
        footer={
          <>
            <form ref={deleteFormRef} action={deleteAction}>
              <input type="hidden" name="contractId" value={contract.id} />
              <button type="button" className="tinyButton dangerButton" onClick={() => setDeleteConfirmOpen(true)}>
                Delete Contract
              </button>
            </form>
            <div>
              <button type="button" className="tinyButton" onClick={closeEdit}>
                Cancel
              </button>
              <button type="submit" className="tinyButton primaryButton" form={`edit-contract-${contract.id}`}>
                Save Contract
              </button>
            </div>
          </>
        }
      >
            {updateState.message ? (
              <ActionNotice tone={updateState.ok ? "success" : "error"} key={updateState.timestamp}>
                {updateState.message}
              </ActionNotice>
            ) : null}
            {deleteState.message ? (
              <ActionNotice tone={deleteState.ok ? "success" : "error"} key={deleteState.timestamp}>
                {deleteState.message}
              </ActionNotice>
            ) : null}
            <form action={updateAction} className="uiDrawerForm" id={`edit-contract-${contract.id}`}>
              <input type="hidden" name="contractId" value={contract.id} />

              <AccordionSection
                className="drawerSection"
                open={openDrawerSection === "artist"}
                onToggle={(isOpen) => handleDrawerSectionToggle("artist", isOpen)}
                title="Artist & Contract"
                description="Identity, role, value, and sessions"
              >
                <div className="drawerFieldGrid">
                  <label className="drawerFieldWide">
                    Guest Artist Profile
                    <select
                      name="guestArtistId"
                      value={editGuestArtistId}
                      onChange={(event) => applyGuestArtist(event.target.value)}
                    >
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
                    Vendor / Employee ID
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
                    Planned Compensation
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
                    Hiring Path
                    <select
                      name="engagementType"
                      value={editEngagementType}
                      onChange={(event) => {
                        const next = event.target.value as typeof editEngagementType;
                        setEditEngagementType(next);
                        setEditIsUnion(next === "union_freelance_artist");
                      }}
                    >
                      <option value="independent_contractor">Independent Contractor Agreement</option>
                      <option value="union_freelance_artist">Union + Freelance Artist Agreement</option>
                      <option value="temporary_employee">Temporary Employee through HR</option>
                    </select>
                  </label>
                  <label>
                    Compensation Basis
                    <select name="compensationBasis" value={editCompensationBasis} onChange={(event) => setEditCompensationBasis(event.target.value as typeof editCompensationBasis)}>
                      <option value="flat_fee">Flat Fee</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </label>
                  {editEngagementType === "temporary_employee" ? (
                    <>
                      <label>
                        HR Onboarding Status
                        <select name="hrOnboardingStatus" value={editHrOnboardingStatus} onChange={(event) => setEditHrOnboardingStatus(event.target.value as typeof editHrOnboardingStatus)}>
                          <option value="not_started">Not Started</option>
                          <option value="submitted_to_hr">Submitted to HR</option>
                          <option value="onboarding">Onboarding</option>
                          <option value="complete">Complete</option>
                        </select>
                      </label>
                      <label>HR Reference<input name="hrOnboardingReference" value={editHrOnboardingReference} onChange={(event) => setEditHrOnboardingReference(event.target.value)} /></label>
                    </>
                  ) : null}
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
                    <input
                      name="contractRole"
                      value={editContractRole}
                      onChange={(event) => setEditContractRole(event.target.value)}
                    />
                  </label>
                  <fieldset className="drawerChoiceGroup drawerFieldWide">
                    <legend>Sessions</legend>
                    <div className="drawerChoiceGrid">
                      {[
                        ["summer", "Summer"],
                        ["fall", "Fall"],
                        ["winter", "Winter"],
                        ["spring", "Spring"]
                      ].map(([value, label]) => (
                        <label className="checkboxLabel" key={value}>
                          <input
                            name="contractSessions"
                            value={value}
                            type="checkbox"
                            checked={editContractSessions.includes(value)}
                            onChange={(event) =>
                              setEditContractSessions((current) =>
                                event.target.checked
                                  ? [...new Set([...current, value])]
                                  : current.filter((session) => session !== value)
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <input type="hidden" name="isUnion" value={editIsUnion ? "true" : "false"} />
                </div>
              </AccordionSection>

              {editIsUnion ? (
                <AccordionSection
                  className="drawerSection"
                  open={openDrawerSection === "union"}
                  onToggle={(isOpen) => handleDrawerSectionToggle("union", isOpen)}
                  title="Union Agreement"
                  description="Agreement and separate fund-check dates"
                >
                  <div className="drawerFieldGrid">
                    <label className="drawerFieldWide">
                      Union Agreement
                      <select
                        name="unionAgreementId"
                        value={editUnionAgreementId}
                        onChange={(event) => {
                          setEditUnionAgreementId(event.target.value);
                          setEditUnionDueDates({});
                        }}
                        required
                      >
                        <option value="">Select agreement</option>
                        {unionAgreementOptions
                          .filter((agreement) => agreement.active || agreement.id === contract.unionAgreementId)
                          .map((agreement) => (
                            <option key={agreement.id} value={agreement.id}>
                              {agreement.name} — {agreement.versionLabel}
                            </option>
                          ))}
                      </select>
                    </label>
                    {editUnionAgreement ? (
                      <div className="drawerContributionList drawerFieldWide">
                        {editUnionAgreement.funds.map((fund) => {
                          const amount = Math.round(numericEditContractValue * fund.percentage) / 100;
                          return (
                            <label key={fund.id} className="drawerContribution">
                              <span>
                                <strong>{fund.fundName}</strong>
                                <small>
                                  {fund.percentage}% ·{" "}
                                  {fund.contributionType === "artist_withholding"
                                    ? "Artist withholding"
                                    : "Employer-paid"}{" "}
                                  · {amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                                </small>
                              </span>
                              <input
                                name={`unionDueDate_${fund.id}`}
                                type="date"
                                aria-label={`${fund.fundName} payment date`}
                                value={editUnionDueDates[fund.id] ?? editDueDates[1] ?? ""}
                                onChange={(event) =>
                                  setEditUnionDueDates((current) => ({ ...current, [fund.id]: event.target.value }))
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </AccordionSection>
              ) : null}

              <AccordionSection
                className="drawerSection"
                open={openDrawerSection === "payment"}
                onToggle={(isOpen) => handleDrawerSectionToggle("payment", isOpen)}
                title="Payment & Check Request"
                description="Dates, delivery, address, and tax information"
              >
                <div className="drawerFieldGrid">
                  <label>
                    Check Request FOAPAL
                    <select
                      name="checkRequestFoapalId"
                      value={editFoapalId}
                      onChange={(event) => setEditFoapalId(event.target.value)}
                    >
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
                      onChange={(event) =>
                        setEditHandling(event.target.value as "mail" | "business_affairs_pickup" | "other")
                      }
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
                  <label className="drawerFieldWide">
                    Tax ID / SSN
                    <SensitiveTextInput name="taxIdOrSsn" placeholder="Leave blank to keep saved value" />
                    <span className="helperText">
                      {contract.taxIdLast4 ? `Saved encrypted value ending in ${contract.taxIdLast4}. ` : ""}
                      Saving overwrites all installment check-request snapshots.
                    </span>
                  </label>
                  <label className="checkboxLabel drawerFieldWide">
                    <input name="clearTaxId" type="checkbox" /> Clear saved Tax ID / SSN
                  </label>
                  <div className="contractInstallmentDates drawerFieldWide">
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
                              Mail by {schedule.mailBy}; AP by {schedule.apReceiveBy}; check run {schedule.checkRunDate}.
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                className="drawerSection"
                open={openDrawerSection === "accounting"}
                onToggle={(isOpen) => handleDrawerSectionToggle("accounting", isOpen)}
                title="Accounting & Productions"
                description="Fiscal year, organization, projects, and Banner account"
              >
                <div className="drawerFieldGrid">
                  <label>
                    Fiscal Year
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
                    Organization
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
                  <label className="drawerFieldWide">
                    Accounting Project
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
                  <fieldset className="drawerChoiceGroup drawerFieldWide">
                    <legend>Associated Productions / Shows</legend>
                    <div className="drawerProductionChoices">
                      {editAssociatedProjectOptions.map((project) => (
                        <label className="checkboxLabel" key={project.id}>
                          <input
                            name="productionProjectIds"
                            value={project.id}
                            type="checkbox"
                            checked={editProductionProjectIds.includes(project.id)}
                            onChange={(event) =>
                              setEditProductionProjectIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, project.id])]
                                  : current.filter((id) => id !== project.id)
                              )
                            }
                          />
                          {project.label}
                        </label>
                      ))}
                    </div>
                    <span className="helperText">
                      {editContractFiscalYearId
                        ? "Only productions from the selected fiscal year are shown."
                        : "Choose a fiscal year or accounting project first."}
                    </span>
                  </fieldset>
                  <label className="drawerFieldWide">
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
                </div>
              </AccordionSection>

              <AccordionSection
                className="drawerSection"
                open={openDrawerSection === "notes"}
                onToggle={(isOpen) => handleDrawerSectionToggle("notes", isOpen)}
                title="Notes"
                description="Internal contract notes"
              >
                <div className="drawerFieldGrid">
                  <label className="drawerFieldWide">
                    Notes
                    <textarea
                      name="notes"
                      rows={4}
                      value={editNotes}
                      onChange={(event) => setEditNotes(event.target.value)}
                    />
                  </label>
                </div>
              </AccordionSection>
            </form>
      </SideDrawer>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteFormRef.current?.requestSubmit();
        }}
        title="Delete contract?"
        description="This permanently deletes the contract and every linked installment row. This action cannot be undone."
        confirmLabel="Delete Contract"
        dangerous
      />
    </>
  );
}
