import {
  updateContractInstallmentStatusAction,
  updateContractWorkflowAction
} from "@/app/contracts/actions";
import { CreateContractBatchForm } from "@/app/contracts/create-contract-batch-form";
import { CreateContractForm } from "@/app/contracts/create-contract-form";
import { ContractRowActions } from "@/app/contracts/contract-row-actions";
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
          <CreateContractForm
            fiscalYearOptions={fiscalYearOptions}
            organizationOptions={organizationOptions}
            projectOptions={projectOptions}
            accountCodeOptions={accountCodeOptions}
          />
        </article>
      ) : null}

      {canManageContracts ? (
        <article className="panel requestFormPanel">
          <h2>Bulk Add Contracts</h2>
          <p className="helperText">Use one shared FY/Org/Project/Account and add multiple names, amounts, and installments.</p>
          <CreateContractBatchForm
            fiscalYearOptions={fiscalYearOptions}
            organizationOptions={organizationOptions}
            projectOptions={projectOptions}
            accountCodeOptions={accountCodeOptions}
          />
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={10}>No contracts yet.</td>
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
                    <td>
                      {canManageContracts ? (
                        <ContractRowActions
                          contract={contract}
                          fiscalYearOptions={fiscalYearOptions}
                          organizationOptions={organizationOptions}
                          projectOptions={projectOptions}
                          accountCodeOptions={accountCodeOptions}
                        />
                      ) : (
                        "-"
                      )}
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
