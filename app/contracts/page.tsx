import { CreateContractBatchForm } from "@/app/contracts/create-contract-batch-form";
import { CreateContractForm } from "@/app/contracts/create-contract-form";
import { ContractRowActions } from "@/app/contracts/contract-row-actions";
import { ContractInstallmentControl, ContractWorkflowControl } from "@/app/contracts/contract-inline-actions";
import { formatCurrency } from "@/lib/format";
import { getContractsData } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

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

export default async function ContractsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

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
        <div className="tableWrap">
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
                            <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>
                              {workflowLabel(contract.workflowStatus)}
                            </span>
                            <ContractWorkflowControl contract={contract} />
                          </>
                        ) : (
                          <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>
                            {workflowLabel(contract.workflowStatus)}
                          </span>
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
                                  <span className={`statusChip ${installmentClass(row.status)}`}>
                                    {installmentLabel(row.status)}
                                  </span>
                                  <ContractInstallmentControl installment={row} />
                                </>
                              ) : (
                                <span className={`statusChip ${installmentClass(row.status)}`}>
                                  {installmentLabel(row.status)}
                                </span>
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
        </div>
      </article>
    </section>
  );
}
