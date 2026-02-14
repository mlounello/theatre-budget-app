"use client";

import { useState } from "react";
import { deleteContractAction, updateContractDetailsAction } from "@/app/contracts/actions";
import type { AccountCodeOption, ContractRow, FiscalYearOption, OrganizationOption, ProcurementProjectOption } from "@/lib/db";

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
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="actionCell">
        <button type="button" className="tinyButton" onClick={() => setOpen(true)}>
          Edit
        </button>
        <form
          action={deleteContractAction}
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
            <form action={updateContractDetailsAction} className="requestForm">
              <input type="hidden" name="contractId" value={contract.id} />
              <label>
                Name
                <input name="contractorName" defaultValue={contract.contractorName} required />
              </label>
              <label>
                Employee ID
                <input name="contractorEmployeeId" defaultValue={contract.contractorEmployeeId ?? ""} />
              </label>
              <label>
                Email
                <input name="contractorEmail" type="email" defaultValue={contract.contractorEmail ?? ""} />
              </label>
              <label>
                Phone
                <input name="contractorPhone" defaultValue={contract.contractorPhone ?? ""} />
              </label>
              <label>
                Contract Value
                <input name="contractValue" type="number" step="0.01" defaultValue={contract.contractValue} required />
              </label>
              <label>
                FY
                <select name="fiscalYearId" defaultValue={contract.fiscalYearId ?? ""}>
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
                <select name="organizationId" defaultValue={contract.organizationId ?? ""}>
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
                <select name="projectId" defaultValue={contract.projectId} required>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Account
                <select name="bannerAccountCodeId" defaultValue={contract.bannerAccountCodeId} required>
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <input name="notes" defaultValue={contract.notes ?? ""} />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={() => setOpen(false)}>
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
