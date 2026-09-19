import { CreateHiringDrawers } from "@/app/contracts/create-hiring-drawers";
import { BulkCheckRequestExport } from "@/app/contracts/bulk-check-request-export";
import { ContractRowActions } from "@/app/contracts/contract-row-actions";
import { ContractCalendarSubscription } from "@/app/contracts/contract-calendar-subscription";
import { ContractInstallmentControl, ContractWorkflowControl } from "@/app/contracts/contract-inline-actions";
import { StatusPill, type StatusTone } from "@/components/ui/status-controls";
import { InstallmentCheckRequestActions } from "@/app/contracts/installment-check-request-actions";
import { UnionContributionStatusControl, UnionSignatureControl } from "@/app/contracts/union-controls";
import { formatCurrency } from "@/lib/format";
import { getContractsData } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { contractCalendarFeedToken } from "@/lib/contract-calendar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function workflowLabel(value: string, engagementType = "independent_contractor"): string {
  if (engagementType === "temporary_employee") {
    if (value === "contract_sent") return "Submitted to HR";
    if (value === "contract_signed_returned") return "HR Onboarding";
    if (value === "siena_signed") return "Onboarding Complete";
    return "Not Started";
  }
  if (value === "contract_sent") return "Contract Sent";
  if (value === "contract_signed_returned") return "Contract Signed + Returned";
  if (value === "siena_signed") return "Siena Signed";
  return "W9 Requested";
}

function installmentLabel(value: string, paymentChannel = "check_request"): string {
  if (paymentChannel === "payroll") {
    if (value === "check_request_submitted") return "Submitted to Payroll";
    if (value === "check_paid") return "Paid through Payroll";
    return "Planned";
  }
  if (value === "check_request_submitted") return "Check Request Submitted";
  if (value === "check_paid") return "Check Paid";
  return "Not Submitted";
}

function workflowTone(value: string): StatusTone {
  if (value === "contract_signed_returned") return "info";
  if (value === "siena_signed") return "success";
  return "warning";
}

function installmentTone(value: string): StatusTone {
  if (value === "check_paid") return "success";
  if (value === "check_request_submitted") return "info";
  return "warning";
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

function engagementLabel(value: string): string {
  if (value === "union_freelance_artist") return "Union Freelance Artist";
  if (value === "temporary_employee") return "Temporary Employee";
  return "Independent Contractor";
}

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{
    fiscalYearId?: string;
    hiring_q?: string;
    hiring_status?: string;
    hiring_session?: string;
    hiring_production?: string;
    hiring_view?: string;
  }>;
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
  const fiscalYearContracts = selectedFiscalYearId
    ? contracts.filter((contract) => contract.fiscalYearId === selectedFiscalYearId)
    : contracts;
  const query = (resolvedSearchParams?.hiring_q ?? "").trim().toLowerCase();
  const statusFilter = (resolvedSearchParams?.hiring_status ?? "").trim();
  const sessionFilter = (resolvedSearchParams?.hiring_session ?? "").trim();
  const productionFilter = (resolvedSearchParams?.hiring_production ?? "").trim();
  const viewFilter = (resolvedSearchParams?.hiring_view ?? "all").trim();
  const today = new Date();
  const dueCutoff = new Date(today);
  dueCutoff.setDate(dueCutoff.getDate() + 30);
  const isDue = (contractId: string) => installments.some((row) => {
    if (row.contractId !== contractId || row.status === "check_paid" || !row.dueDate) return false;
    const due = new Date(`${row.dueDate}T12:00:00`);
    return due <= dueCutoff;
  });
  const needsAttention = (contract: (typeof contracts)[number]) =>
    contract.workflowStatus === "w9_requested" ||
    (contract.engagementType === "temporary_employee" && contract.hrOnboardingStatus !== "complete") ||
    (contract.engagementType === "union_freelance_artist" && contract.unionSignatureStatus !== "complete") ||
    isDue(contract.id);
  const visibleContracts = fiscalYearContracts.filter((contract) => {
    if (query) {
      const haystack = `${contract.contractorName} ${contract.contractRole ?? ""} ${contract.contractorEmployeeId ?? ""} ${contract.projectName} ${contract.productionProjects.map((production) => production.name).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (statusFilter && contract.workflowStatus !== statusFilter) return false;
    if (sessionFilter && !contract.contractSessions.includes(sessionFilter as "summer" | "fall" | "winter" | "spring")) return false;
    if (productionFilter && !contract.productionProjects.some((production) => production.id === productionFilter)) return false;
    if (viewFilter === "checks_due" && !isDue(contract.id)) return false;
    if (viewFilter === "needs_attention" && !needsAttention(contract)) return false;
    return true;
  });
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
  const visibleContractById = new Map(visibleContracts.map((contract) => [contract.id, contract]));
  const dateSortValue = (value: string | null) => value || "9999-12-31";
  const scheduledInstallments = visibleInstallments
    .map((installment) => ({ installment, contract: visibleContractById.get(installment.contractId) }))
    .filter((entry): entry is { installment: (typeof installments)[number]; contract: (typeof contracts)[number] } => Boolean(entry.contract))
    .sort((a, b) => {
      if (a.installment.status === "check_paid" && b.installment.status !== "check_paid") return 1;
      if (a.installment.status !== "check_paid" && b.installment.status === "check_paid") return -1;
      return dateSortValue(a.installment.dueDate).localeCompare(dateSortValue(b.installment.dueDate));
    });
  const scheduledUnionContributions = unionContributions
    .filter((contribution) => visibleContractIds.has(contribution.contractId))
    .map((contribution) => ({ contribution, contract: visibleContractById.get(contribution.contractId) }))
    .filter((entry): entry is { contribution: (typeof unionContributions)[number]; contract: (typeof contracts)[number] } => Boolean(entry.contract))
    .sort((a, b) => {
      if (a.contribution.status === "check_paid" && b.contribution.status !== "check_paid") return 1;
      if (a.contribution.status !== "check_paid" && b.contribution.status === "check_paid") return -1;
      return dateSortValue(a.contribution.dueDate).localeCompare(dateSortValue(b.contribution.dueDate));
    });
  const bulkCheckRequestItems = visibleContracts.flatMap((contract) => {
    const contractInstallments = (installmentByContract.get(contract.id) ?? []).sort(
      (a, b) => a.installmentNumber - b.installmentNumber
    );
    const contractContributions = unionContributionsByContract.get(contract.id) ?? [];
    return [
      ...contractInstallments.filter((installment) => installment.paymentChannel !== "payroll").map((installment) => ({
        value: `installment:${contract.id}:${installment.id}`,
        contractorName: contract.contractorName,
        role: contract.contractRole || "Role not set",
        title: `Installment ${installment.installmentNumber} · ${formatCurrency(installment.installmentAmount)}`,
        details: `Due ${shortDate(installment.dueDate)} · Mail by ${shortDate(installment.mailBy)}`,
        kind: "artist" as const
      })),
      ...contractContributions.map((contribution) => ({
        value: `union:${contract.id}:${contribution.id}`,
        contractorName: contract.contractorName,
        role: contract.contractRole || "Role not set",
        title: `${contribution.fundName} · ${formatCurrency(contribution.amount)}`,
        details: `${contribution.percentage}% · Due ${shortDate(contribution.dueDate)}`,
        kind: "union" as const
      }))
    ];
  });

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Hiring</p>
        <h1>Hiring &amp; Payments</h1>
        <p className="heroSubtitle">Track independent contractors, union freelance artists, and temporary employees by project and payment month.</p>
      </header>

      {canManageContracts ? (
        <ContractCalendarSubscription
          feedUrl={calendarFeedUrl}
          googleCalendarUrl={googleCalendarSubscriptionUrl}
        />
      ) : null}

      <article className="panel hiringToolbarPanel">
        <div className="contractsPanelHeader">
          <form method="get" className="hiringFilters">
            <input type="hidden" name="fiscalYearId" value={selectedFiscalYearId} />
            <label>Search<input name="hiring_q" defaultValue={resolvedSearchParams?.hiring_q ?? ""} placeholder="Name, role, ID, or production" /></label>
            <label>Status<select name="hiring_status" defaultValue={statusFilter}><option value="">All statuses</option><option value="w9_requested">Not Started</option><option value="contract_sent">Agreement Sent</option><option value="contract_signed_returned">Signed + Returned</option><option value="siena_signed">Complete</option></select></label>
            <label>Session<select name="hiring_session" defaultValue={sessionFilter}><option value="">All sessions</option><option value="summer">Summer</option><option value="fall">Fall</option><option value="winter">Winter</option><option value="spring">Spring</option></select></label>
            <label>Production<select name="hiring_production" defaultValue={productionFilter}><option value="">All productions</option>{projectOptions.filter((project) => project.fiscalYearId === selectedFiscalYearId).map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}</select></label>
            <label>View<select name="hiring_view" defaultValue={viewFilter}><option value="all">All Hiring</option><option value="payments">Payment Schedule</option><option value="checks_due">Checks Due</option><option value="needs_attention">Needs Attention</option></select></label>
            <button type="submit" className="tinyButton">Apply</button>
          </form>
          {canManageContracts ? <CreateHiringDrawers
            fiscalYearOptions={fiscalYearOptions}
            organizationOptions={organizationOptions}
            projectOptions={projectOptions}
            accountCodeOptions={accountCodeOptions}
            foapalOptions={foapalOptions}
            guestArtistOptions={guestArtistOptions}
            unionAgreementOptions={unionAgreementOptions}
          /> : null}
        </div>
      </article>

      {viewFilter === "payments" ? (
        <article className="panel contractsPanel">
          <div className="contractsPanelHeader">
            <div>
              <p className="eyebrow">Separate from Procurement</p>
              <h2>Hiring Payment Schedule</h2>
              <p className="helperText">
                These commitments remain allocated to their budgets, projects, and departments, but are managed here instead of in the purchasing queue.
              </p>
            </div>
          </div>
          {canManageContracts && bulkCheckRequestItems.length > 0 ? (
            <BulkCheckRequestExport items={bulkCheckRequestItems} />
          ) : null}

          <section className="contractChecksPanel" aria-labelledby="artist-payment-schedule-heading">
            <h3 id="artist-payment-schedule-heading">Artist Contract Payments</h3>
            <p className="helperText">{scheduledInstallments.length} scheduled payments</p>
            {scheduledInstallments.length === 0 ? <p className="emptyState">No artist payments match these filters.</p> : (
              <div className="contractCheckList">
                {scheduledInstallments.map(({ installment, contract }) => (
                  <div className="contractCheckRow" key={installment.id}>
                    <div className="contractCheckSummary">
                      <strong>{contract.contractorName} · Installment {installment.installmentNumber} · {formatCurrency(installment.installmentAmount)}</strong>
                      <small>
                        {contract.contractRole || "Role not set"} · {contract.projectName} · Due {shortDate(installment.dueDate)} · Mail by {shortDate(installment.mailBy)}
                      </small>
                    </div>
                    <StatusPill tone={installmentTone(installment.status)}>{installmentLabel(installment.status, installment.paymentChannel)}</StatusPill>
                    <div className="contractCheckActions">
                      {canManageContracts ? <ContractInstallmentControl installment={installment} /> : null}
                      {canManageContracts && installment.paymentChannel !== "payroll" ? <InstallmentCheckRequestActions installment={installment} foapalOptions={foapalOptions} /> : null}
                      {installment.paymentChannel !== "payroll" ? <a className="tinyButton" href={`/contracts/${contract.id}/installments/${installment.id}/check-request`}>PDF</a> : null}
                      <a className="tinyButton" href={`/contracts?fiscalYearId=${encodeURIComponent(selectedFiscalYearId)}&hiring_view=payments&ct_edit=${encodeURIComponent(contract.id)}`}>Open Hire</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="contractChecksPanel" aria-labelledby="union-payment-schedule-heading">
            <h3 id="union-payment-schedule-heading">Union Pension &amp; Benefit Funds</h3>
            <p className="helperText">{scheduledUnionContributions.length} scheduled fund payments</p>
            {scheduledUnionContributions.length === 0 ? <p className="emptyState">No union-fund payments match these filters.</p> : (
              <div className="contractCheckList">
                {scheduledUnionContributions.map(({ contribution, contract }) => (
                  <div className="contractCheckRow unionCheckRow" key={contribution.id}>
                    <div className="contractCheckSummary">
                      <strong>{contribution.fundName} · {formatCurrency(contribution.amount)}</strong>
                      <small>
                        {contract.contractorName} · {contract.contractRole || "Role not set"} · {contract.projectName} · {contribution.percentage}% · Due {shortDate(contribution.dueDate)}
                      </small>
                    </div>
                    <StatusPill tone={installmentTone(contribution.status)}>{installmentLabel(contribution.status)}</StatusPill>
                    <div className="contractCheckActions">
                      {canManageContracts ? <UnionContributionStatusControl contribution={contribution} /> : null}
                      <a className="tinyButton" href={`/contracts/${contract.id}/union-contributions/${contribution.id}/check-request`}>Separate PDF</a>
                      <a className="tinyButton" href={`/contracts?fiscalYearId=${encodeURIComponent(selectedFiscalYearId)}&hiring_view=payments&ct_edit=${encodeURIComponent(contract.id)}`}>Open Hire</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>
      ) : (
      <article className="panel contractsPanel">
        <div className="contractsPanelHeader">
          <div>
            <h2>Hiring Records</h2>
            <p className="helperText">{visibleContracts.length} records match the selected view</p>
          </div>
        </div>
        {canManageContracts && bulkCheckRequestItems.length > 0 ? (
          <BulkCheckRequestExport items={bulkCheckRequestItems} />
        ) : null}
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
                      <span className="contractEngagementBadge">{engagementLabel(contract.engagementType)}</span>
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
                      {canManageContracts ? (
                        <>
                          <StatusPill tone={workflowTone(contract.workflowStatus)}>
                            {workflowLabel(contract.workflowStatus, contract.engagementType)}
                          </StatusPill>
                          <ContractWorkflowControl contract={contract} compact />
                        </>
                      ) : (
                        <StatusPill tone={workflowTone(contract.workflowStatus)}>
                          {workflowLabel(contract.workflowStatus, contract.engagementType)}
                        </StatusPill>
                      )}
                      {contract.isUnion ? <span className="contractUnionBadge">Union</span> : null}
                      {contract.engagementType === "temporary_employee" ? <span className="contractUnionBadge">HR: {contract.hrOnboardingStatus.replaceAll("_", " ")}</span> : null}
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
                        <StatusPill tone={workflowTone(contract.workflowStatus)}>
                          {workflowLabel(contract.workflowStatus, contract.engagementType)}
                        </StatusPill>
                        {contract.isUnion ? (
                          <div className="contractUnionWorkflow">
                            <strong>{contract.unionAgreementName ?? "Union Agreement"}</strong>
                            <UnionSignatureControl contract={contract} />
                          </div>
                        ) : null}
                      </section>

                      <section className="contractChecksPanel">
                        <h4>{contract.engagementType === "temporary_employee" ? "Payroll schedule" : "Artist installments"}</h4>
                        <div className="contractCheckList">
                          {rows.map((row) => (
                            <div className="contractCheckRow" key={row.id}>
                              <div className="contractCheckSummary">
                                <strong>
                                  Installment {row.installmentNumber} · {formatCurrency(row.installmentAmount)}
                                </strong>
                                <small>
                                  Due {shortDate(row.dueDate)} · Mail by {shortDate(row.mailBy)}
                                </small>
                              </div>
                              <StatusPill tone={installmentTone(row.status)}>
                                {installmentLabel(row.status, row.paymentChannel)}
                              </StatusPill>
                              {canManageContracts ? (
                                <div className="contractCheckActions">
                                  <ContractInstallmentControl installment={row} />
                                  {contract.engagementType !== "temporary_employee" ? <>
                                    <InstallmentCheckRequestActions installment={row} foapalOptions={foapalOptions} />
                                    <a className="tinyButton" href={`/contracts/${contract.id}/installments/${row.id}/check-request`}>PDF</a>
                                  </> : null}
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
                                  <StatusPill tone={installmentTone(contribution.status)}>
                                    {installmentLabel(contribution.status)}
                                  </StatusPill>
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
      )}
    </section>
  );
}
