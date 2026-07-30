import { CreateContractBatchForm } from "@/app/contracts/create-contract-batch-form";
import { CreateContractForm } from "@/app/contracts/create-contract-form";
import { BulkCheckRequestExport } from "@/app/contracts/bulk-check-request-export";
import { ContractRowActions } from "@/app/contracts/contract-row-actions";
import { ContractCalendarSubscription } from "@/app/contracts/contract-calendar-subscription";
import { ContractInstallmentControl, ContractWorkflowControl } from "@/app/contracts/contract-inline-actions";
import { InstallmentCheckRequestActions } from "@/app/contracts/installment-check-request-actions";
import { UnionContributionStatusControl, UnionSignatureControl } from "@/app/contracts/union-controls";
import { formatCurrency } from "@/lib/format";
import { getContractsData } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { contractCalendarFeedToken } from "@/lib/contract-calendar";
import { headers } from "next/headers";
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

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const origin = host ? `${forwardedProto ?? (host.includes("localhost") ? "http" : "https")}://${host}` : "";
  const calendarFeedUrl = `${origin}/api/calendar/contracts/${contractCalendarFeedToken()}`;
  const googleCalendarSubscriptionUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(
    calendarFeedUrl
  )}`;

  const {
    contracts,
    installments,
    unionContributions,
    fiscalYearOptions,
    organizationOptions,
    projectOptions,
    accountCodeOptions,
    foapalOptions,
    guestArtistOptions,
    unionAgreementOptions,
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
  const unionContributionsByContract = new Map<string, typeof unionContributions>();
  for (const contribution of unionContributions) {
    const list = unionContributionsByContract.get(contribution.contractId) ?? [];
    list.push(contribution);
    unionContributionsByContract.set(contribution.contractId, list);
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Contracts</p>
        <h1>Contract Payments</h1>
        <p className="heroSubtitle">Track contract paperwork workflow and installment check payments outside procurement.</p>
      </header>

      {canManageContracts ? (
        <ContractCalendarSubscription
          feedUrl={calendarFeedUrl}
          googleCalendarUrl={googleCalendarSubscriptionUrl}
        />
      ) : null}

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
            unionAgreementOptions={unionAgreementOptions}
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

      <article className="panel contractsPanel">
        <div className="contractsPanelHeader">
          <div>
            <h2>Contracts</h2>
            <p className="helperText">{visibleContracts.length} contracts in the selected fiscal year</p>
          </div>
        </div>
        {canManageContracts && visibleContracts.length > 0 ? <BulkCheckRequestExport /> : null}
        {visibleContracts.length === 0 ? (
          <p className="emptyState">No contracts yet.</p>
        ) : (
          <div className="contractList">
            {visibleContracts.map((contract) => {
              const sessionLabels = contractSessionLabels(contract.contractSessions);
              const associatedProductions = contract.productionProjects.filter(
                (production) => production.id !== contract.projectId
              );
              const rows = (installmentByContract.get(contract.id) ?? []).sort(
                (a, b) => a.installmentNumber - b.installmentNumber
              );
              const contractUnionContributions = unionContributionsByContract.get(contract.id) ?? [];
              const paidTotal = rows
                .filter((row) => row.status === "check_paid")
                .reduce((sum, row) => sum + row.installmentAmount, 0);
              const nextPayment = rows.find((row) => row.status !== "check_paid") ?? rows[rows.length - 1];
              const productionNames = associatedProductions.map(
                (production) => `${production.name}${production.season ? ` (${production.season})` : ""}`
              );

              return (
                <article className="contractCard" key={contract.id}>
                  <header className="contractCardHeader">
                    <div className="contractIdentity">
                      <h3>{contract.contractorName}</h3>
                      <p>
                        {contract.contractRole || "Role not set"}
                        {sessionLabels.length > 0 ? ` · ${sessionLabels.join(", ")}` : ""}
                      </p>
                      <small>Vendor #{contract.contractorEmployeeId ?? "Not assigned"}</small>
                    </div>
                    <div className="contractMetaItem">
                      <span>Production</span>
                      <strong>
                        {contract.projectName}
                        {contract.season ? ` (${contract.season})` : ""}
                      </strong>
                      {productionNames.length > 0 ? <small>For {productionNames.join(", ")}</small> : null}
                    </div>
                    <div className="contractMetaItem">
                      <span>Contract</span>
                      <strong>{formatCurrency(contract.contractValue)}</strong>
                      <small>
                        {contract.fiscalYearName ?? "No FY"} · {contract.bannerAccountCode ?? "No Banner code"}
                      </small>
                    </div>
                    <div className="contractMetaItem">
                      <span>Next check</span>
                      <strong>{nextPayment ? formatCurrency(nextPayment.installmentAmount) : "No installments"}</strong>
                      <small>
                        {nextPayment
                          ? `Due ${shortDate(nextPayment.dueDate)} · Mail ${shortDate(nextPayment.mailBy)}`
                          : "No date"}
                      </small>
                    </div>
                    <div className="contractStatusSummary">
                      <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>
                        {workflowLabel(contract.workflowStatus)}
                      </span>
                      {contract.isUnion ? <span className="contractUnionBadge">Union</span> : null}
                    </div>
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
                        unionAgreementOptions={unionAgreementOptions}
                        unionContributions={contractUnionContributions}
                      />
                    ) : null}
                  </header>

                  <details className="contractCardDetails">
                    <summary>
                      <span>Workflow &amp; check requests</span>
                      <small>
                        {rows.length + contractUnionContributions.length} checks · {formatCurrency(paidTotal)} paid
                      </small>
                    </summary>
                    <div className="contractDetailGrid">
                      <section className="contractWorkflowPanel">
                        <h4>Contract workflow</h4>
                        {canManageContracts ? (
                          <ContractWorkflowControl contract={contract} />
                        ) : (
                          <span className={`statusChip ${workflowClass(contract.workflowStatus)}`}>
                            {workflowLabel(contract.workflowStatus)}
                          </span>
                        )}
                        {contract.isUnion ? (
                          <div className="contractUnionWorkflow">
                            <strong>{contract.unionAgreementName ?? "Union Agreement"}</strong>
                            <UnionSignatureControl contract={contract} />
                          </div>
                        ) : null}
                      </section>

                      <section className="contractChecksPanel">
                        <h4>Artist installments</h4>
                        <div className="contractCheckList">
                          {rows.map((row) => (
                            <div className="contractCheckRow" key={row.id}>
                              {canManageContracts ? (
                                <label className="bulkCheckSelect" title="Include in combined PDF">
                                  <input
                                    type="checkbox"
                                    name="items"
                                    form="bulk-check-request-export"
                                    value={`installment:${contract.id}:${row.id}`}
                                    aria-label={`Select ${contract.contractorName} installment ${row.installmentNumber} check request`}
                                  />
                                </label>
                              ) : null}
                              <div className="contractCheckSummary">
                                <strong>
                                  Installment {row.installmentNumber} · {formatCurrency(row.installmentAmount)}
                                </strong>
                                <small>
                                  Due {shortDate(row.dueDate)} · Mail by {shortDate(row.mailBy)}
                                </small>
                              </div>
                              <span className={`statusChip ${installmentClass(row.status)}`}>
                                {installmentLabel(row.status)}
                              </span>
                              {canManageContracts ? (
                                <div className="contractCheckActions">
                                  <ContractInstallmentControl installment={row} />
                                  <InstallmentCheckRequestActions installment={row} foapalOptions={foapalOptions} />
                                  <a
                                    className="tinyButton"
                                    href={`/contracts/${contract.id}/installments/${row.id}/check-request`}
                                  >
                                    PDF
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        {contractUnionContributions.length > 0 ? (
                          <>
                            <h4 className="unionChecksHeading">Union fund checks</h4>
                            <div className="contractCheckList">
                              {contractUnionContributions.map((contribution) => (
                                <div className="contractCheckRow unionCheckRow" key={contribution.id}>
                                  {canManageContracts ? (
                                    <label className="bulkCheckSelect" title="Include in combined PDF">
                                      <input
                                        type="checkbox"
                                        name="items"
                                        form="bulk-check-request-export"
                                        value={`union:${contract.id}:${contribution.id}`}
                                        aria-label={`Select ${contribution.fundName} separate check request`}
                                      />
                                    </label>
                                  ) : null}
                                  <div className="contractCheckSummary">
                                    <strong>
                                      {contribution.fundName} · {formatCurrency(contribution.amount)}
                                    </strong>
                                    <small>
                                      {contribution.percentage}% ·{" "}
                                      {contribution.contributionType === "artist_withholding"
                                        ? "Artist withholding"
                                        : "Employer-paid"}{" "}
                                      · Due {shortDate(contribution.dueDate)}
                                    </small>
                                  </div>
                                  <span className={`statusChip ${installmentClass(contribution.status)}`}>
                                    {installmentLabel(contribution.status)}
                                  </span>
                                  {canManageContracts ? (
                                    <div className="contractCheckActions">
                                      <UnionContributionStatusControl contribution={contribution} />
                                      <a
                                        className="tinyButton"
                                        href={`/contracts/${contract.id}/union-contributions/${contribution.id}/check-request`}
                                      >
                                        Separate PDF
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </section>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
