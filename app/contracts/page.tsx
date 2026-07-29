import { CreateContractBatchForm } from "@/app/contracts/create-contract-batch-form";
import { CreateContractForm } from "@/app/contracts/create-contract-form";
import { ContractRowActions } from "@/app/contracts/contract-row-actions";
import { ContractInstallmentControl, ContractWorkflowControl } from "@/app/contracts/contract-inline-actions";
import { InstallmentCheckRequestActions } from "@/app/contracts/installment-check-request-actions";
import { formatCurrency } from "@/lib/format";
import { getContractsData } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
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

function contractSessionLabels(values: string[]): string[] {
  const labels = new Map([
    ["summer", "Summer"],
    ["fall", "Fall"],
    ["winter", "Winter"],
    ["spring", "Spring"]
  ]);
  return values.map((value) => labels.get(value)).filter((value): value is string => Boolean(value));
}

function shortDate(value: string | null): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year.slice(2)}`;
}

function addDaysYmd(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function googleCalendarHref(contractorName: string, projectName: string, mailBy: string | null): string | null {
  if (!mailBy) return null;
  const start = mailBy.replaceAll("-", "");
  const end = addDaysYmd(mailBy, 1).replaceAll("-", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Mail check request: ${contractorName}`,
    dates: `${start}/${end}`,
    details: `Put the check request in inter-office mail for ${contractorName} (${projectName}).`,
    trp: "false"
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const {
    contracts,
    installments,
    fiscalYearOptions,
    organizationOptions,
    projectOptions,
    accountCodeOptions,
    foapalOptions,
    guestArtistOptions,
    canManageContracts
  } =
    await getContractsData();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedFiscalYearId = resolveRequestedFiscalYearId(fiscalYearOptions, resolvedSearchParams?.fiscalYearId);
  const visibleContracts = selectedFiscalYearId
    ? contracts.filter((contract) => contract.fiscalYearId === selectedFiscalYearId)
    : contracts;
  const visibleContractIds = new Set(visibleContracts.map((contract) => contract.id));
  const visibleInstallments = installments.filter((installment) => visibleContractIds.has(installment.contractId));

  const installmentByContract = new Map<string, typeof installments>();
  for (const installment of visibleInstallments) {
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
            foapalOptions={foapalOptions}
            guestArtistOptions={guestArtistOptions}
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
                <th>Accounting / Production</th>
                <th>Banner Code</th>
                <th>Contract Value</th>
                <th>Installments</th>
                <th>Workflow</th>
                <th>Installment Payments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleContracts.length === 0 ? (
                <tr>
                  <td colSpan={10}>No contracts yet.</td>
                </tr>
              ) : (
                visibleContracts.map((contract) => {
                  const sessionLabels = contractSessionLabels(contract.contractSessions);
                  const associatedProductions = contract.productionProjects.filter(
                    (production) => production.id !== contract.projectId
                  );
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
                        <span>Vendor #: {contract.contractorEmployeeId ?? "-"}</span>
                        {contract.contractRole || sessionLabels.length > 0 ? (
                          <>
                            <br />
                            <span className="helperText">
                              {contract.contractRole ? `Role: ${contract.contractRole}` : ""}
                              {contract.contractRole && sessionLabels.length > 0 ? " · " : ""}
                              {sessionLabels.length > 0
                                ? `${sessionLabels.length === 1 ? "Session" : "Sessions"}: ${sessionLabels.join(", ")}`
                                : ""}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td>{contract.fiscalYearName ?? "-"}</td>
                      <td>{contract.organizationLabel ?? "-"}</td>
                      <td>
                        {contract.projectName}
                        {contract.season ? ` (${contract.season})` : ""}
                        {associatedProductions.length > 0 ? (
                          <>
                            <br />
                            <span className="helperText">
                              For{" "}
                              {associatedProductions
                                .map(
                                  (production) =>
                                    `${production.name}${production.season ? ` (${production.season})` : ""}`
                                )
                                .join(", ")}
                            </span>
                          </>
                        ) : null}
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
                          {rows.map((row) => {
                            const calendarHref = googleCalendarHref(contract.contractorName, contract.projectName, row.mailBy);
                            return (
                              <div key={row.id} className="inlineEditForm" style={{ marginBottom: "0.4rem" }}>
                                <span>
                                  #{row.installmentNumber} {formatCurrency(row.installmentAmount)}
                                  <br />
                                  <span className="muted">
                                    Due {shortDate(row.dueDate)} | Mail by {shortDate(row.mailBy)}
                                  </span>
                                </span>
                                {canManageContracts ? (
                                  <>
                                    <span className={`statusChip ${installmentClass(row.status)}`}>
                                      {installmentLabel(row.status)}
                                    </span>
                                    <ContractInstallmentControl installment={row} />
                                    <InstallmentCheckRequestActions installment={row} foapalOptions={foapalOptions} />
                                    <a className="tinyButton" href={`/contracts/${contract.id}/installments/${row.id}/check-request`}>
                                      Check Request PDF
                                    </a>
                                    {calendarHref ? (
                                      <a className="tinyButton" href={calendarHref} target="_blank" rel="noreferrer">
                                        Google Calendar
                                      </a>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className={`statusChip ${installmentClass(row.status)}`}>
                                    {installmentLabel(row.status)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        {canManageContracts ? (
                          <ContractRowActions
                            contract={contract}
                            installments={rows}
                            fiscalYearOptions={fiscalYearOptions}
                            organizationOptions={organizationOptions}
                            projectOptions={projectOptions}
                            accountCodeOptions={accountCodeOptions}
                            foapalOptions={foapalOptions}
                            guestArtistOptions={guestArtistOptions}
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
