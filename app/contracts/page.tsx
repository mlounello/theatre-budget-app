import {
  createContractAction,
  updateContractDetailsAction,
  updateContractInstallmentStatusAction,
  updateContractWorkflowAction
} from "@/app/contracts/actions";
import { formatCurrency } from "@/lib/format";
import { getContractsData } from "@/lib/db";

function workflowLabel(value: string): string {
  if (value === "contract_sent") return "Contract Sent";
  if (value === "contract_signed_returned") return "Contract Signed + Returned";
  if (value === "siena_signed") return "Siena Signed";
  return "W9 Requested";
}

function installmentLabel(value: string): string {
  if (value === "check_request_submitted") return "Check Request Submitted";
  if (value === "check_paid") return "Check Paid";
  return "Not Submitted";
}

function workflowClass(value: string): string {
  if (value === "contract_sent") return "status-ordered";
  if (value === "contract_signed_returned") return "status-invoice_received";
  if (value === "siena_signed") return "status-encumbered";
  return "status-requested";
}

function installmentClass(value: string): string {
  if (value === "check_paid") return "status-paid";
  if (value === "check_request_submitted") return "status-ordered";
  return "status-requested";
}

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;

  const { contracts, installments, fiscalYearOptions, organizationOptions, projectOptions, accountCodeOptions, canManageContracts } =
    await getContractsData();

  const installmentByContract = new Map<string, typeof installments>();
  for (const installment of installments) {
    const list = installmentByContract.get(installment.contractId) ?? [];
    list.push(installment);
    installmentByContract.set(installment.contractId, list);
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Contracts</p>
        <h1>Contract Payments</h1>
        <p className="heroSubtitle">Track contract paperwork workflow and installment check payments outside procurement.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      {canManageContracts ? (
        <article className="panel requestFormPanel">
          <h2>Add Contract</h2>
          <form className="requestForm" action={createContractAction}>
            <label>
              Fiscal Year
              <select name="fiscalYearId" defaultValue="">
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
              <select name="organizationId" defaultValue="">
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
              <select name="projectId" required>
                <option value="">Select project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Banner Account Code
              <select name="bannerAccountCodeId" required>
                <option value="">Select account code</option>
                {accountCodeOptions.map((accountCode) => (
                  <option key={accountCode.id} value={accountCode.id}>
                    {accountCode.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contracted Employee Name
              <input name="contractorName" required />
            </label>
            <label>
              Employee ID Number
              <input name="contractorEmployeeId" />
            </label>
            <label>
              Email
              <input name="contractorEmail" type="email" />
            </label>
            <label>
              Phone
              <input name="contractorPhone" />
            </label>
            <label>
              Contract Value
              <input name="contractValue" type="number" step="0.01" required />
            </label>
            <label>
              Payment Installments
              <select name="installmentCount" defaultValue="1">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <label>
              Notes
              <input name="notes" />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Contract
            </button>
          </form>
        </article>
      ) : null}

      <article className="panel tablePanel">
        <h2>Contracts</h2>
        <table>
          <thead>
            <tr>
              <th>Contractor</th>
              <th>FY</th>
              <th>Org</th>
              <th>Project</th>
              <th>Banner Code</th>
              <th>Contract Value</th>
              <th>Installments</th>
              <th>Workflow</th>
              <th>Installment Payments</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={9}>No contracts yet.</td>
              </tr>
            ) : (
              contracts.map((contract) => {
                const rows = (installmentByContract.get(contract.id) ?? []).sort(
                  (a, b) => a.installmentNumber - b.installmentNumber
                );
                const paidTotal = rows
                  .filter((row) => row.status === "check_paid")
                  .reduce((sum, row) => sum + row.installmentAmount, 0);
                return (
                  <tr key={contract.id}>
                    <td>
                      <strong>{contract.contractorName}</strong>
                      <br />
                      <span>{contract.contractorEmployeeId ?? "-"}</span>
                    </td>
                    <td>{contract.fiscalYearName ?? "-"}</td>
                    <td>{contract.organizationLabel ?? "-"}</td>
                    <td>
                      {contract.projectName}
                      {contract.season ? ` (${contract.season})` : ""}
                    </td>
                    <td>{contract.bannerAccountCode ?? "-"}</td>
                    <td>{formatCurrency(contract.contractValue)}</td>
                    <td>{contract.installmentCount}</td>
                    <td>
                      {canManageContracts ? (
                        <form action={updateContractDetailsAction} className="requestForm" style={{ marginBottom: "0.6rem" }}>
                          <input type="hidden" name="contractId" value={contract.id} />
                          <label>
                            Name
                            <input name="contractorName" defaultValue={contract.contractorName} />
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
                            <input name="contractValue" type="number" step="0.01" defaultValue={contract.contractValue} />
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
                            <select name="projectId" defaultValue={contract.projectId}>
                              {projectOptions.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Banner Account
                            <select name="bannerAccountCodeId" defaultValue={contract.bannerAccountCodeId}>
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
                          <button className="tinyButton" type="submit">
                            Save Contract
                          </button>
                        </form>
                      ) : null}
                      {canManageContracts ? (
                        <>
                          <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>{workflowLabel(contract.workflowStatus)}</span>
                          <form action={updateContractWorkflowAction} className="inlineEditForm">
                            <input type="hidden" name="contractId" value={contract.id} />
                            <select name="workflowStatus" defaultValue={contract.workflowStatus}>
                              <option value="w9_requested">W9 Requested</option>
                              <option value="contract_sent">Contract Sent</option>
                              <option value="contract_signed_returned">Contract Signed + Returned</option>
                              <option value="siena_signed">Siena Signed</option>
                            </select>
                            <button className="tinyButton" type="submit">
                              Save
                            </button>
                          </form>
                        </>
                      ) : (
                        <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>{workflowLabel(contract.workflowStatus)}</span>
                      )}
                    </td>
                    <td>
                      <div className="stackedDetails">
                        <p>
                          Paid: <strong>{formatCurrency(paidTotal)}</strong>
                        </p>
                        {rows.map((row) => (
                          <div key={row.id} className="inlineEditForm" style={{ marginBottom: "0.4rem" }}>
                            <span>
                              #{row.installmentNumber} {formatCurrency(row.installmentAmount)}
                            </span>
                            {canManageContracts ? (
                              <>
                                <span className={`statusChip ${installmentClass(row.status)}`}>{installmentLabel(row.status)}</span>
                                <form action={updateContractInstallmentStatusAction} className="inlineEditForm">
                                  <input type="hidden" name="installmentId" value={row.id} />
                                  <select name="status" defaultValue={row.status}>
                                    <option value="planned">Not Submitted</option>
                                    <option value="check_request_submitted">Check Request Submitted</option>
                                    <option value="check_paid">Check Paid</option>
                                  </select>
                                  <button type="submit" className="tinyButton">
                                    Save
                                  </button>
                                </form>
                              </>
                            ) : (
                              <span className={`statusChip ${installmentClass(row.status)}`}>{installmentLabel(row.status)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
