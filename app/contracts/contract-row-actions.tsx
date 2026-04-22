"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteContractAction, updateContractDetailsAction, type ActionState } from "@/app/contracts/actions";
import type { AccountCodeOption, ContractRow, FiscalYearOption, OrganizationOption, ProcurementProjectOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function ContractRowActions({
  contract,
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions
}: {
  contract: ContractRow;
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
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
  const [editContractorName, setEditContractorName] = useState(contract.contractorName ?? "");
  const [editContractorEmployeeId, setEditContractorEmployeeId] = useState(contract.contractorEmployeeId ?? "");
  const [editContractorEmail, setEditContractorEmail] = useState(contract.contractorEmail ?? "");
  const [editContractorPhone, setEditContractorPhone] = useState(contract.contractorPhone ?? "");
  const [editContractValue, setEditContractValue] = useState(String(contract.contractValue ?? 0));
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
    setEditContractorName(contract.contractorName ?? "");
    setEditContractorEmployeeId(contract.contractorEmployeeId ?? "");
    setEditContractorEmail(contract.contractorEmail ?? "");
    setEditContractorPhone(contract.contractorPhone ?? "");
    setEditContractValue(String(contract.contractValue ?? 0));
    setEditNotes(contract.notes ?? "");
  }, [open, contract]);

  useEffect(() => {
    if (!deleteState.ok || !deleteState.message) return;
    if (open) closeEdit();
  }, [deleteState, open, closeEdit]);

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
