import { notFound, redirect } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { getProjectBudgetBoard } from "@/lib/db";
import { getAccessContext } from "@/lib/access";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectBudgetBoardPage({ params }: Props) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const { projectId } = await params;

  let board;
  try {
    board = await getProjectBudgetBoard(projectId);
  } catch {
    notFound();
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Project Budget Board</p>
        <h1>{board.projectName}</h1>
        <p className="heroSubtitle">Spreadsheet-equivalent rollups with explicit status totals by category and Banner code.</p>
      </header>

      <article className="panel" style={{ marginBottom: "0.8rem" }}>
        <h2>Category Rollup</h2>
      </article>
      <div className="tableWrap" style={{ marginBottom: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Allocated</th>
              <th>Requested (Open)</th>
              <th>Held</th>
              <th>Pending CC</th>
              <th>ENC</th>
              <th>YTD</th>
              <th>Obligated</th>
              <th>Remaining</th>
              <th>Remaining if Requested Approved</th>
            </tr>
          </thead>
          <tbody>
            {board.categoryRollups.length === 0 ? (
              <tr>
                <td colSpan={10}>No category rollups for this project yet.</td>
              </tr>
            ) : null}
            {board.categoryRollups.map((row) => (
              <tr key={row.category}>
                <td>{row.category}</td>
                <td>{formatCurrency(row.allocatedTotal)}</td>
                <td>{formatCurrency(row.requestedOpenTotal)}</td>
                <td>{formatCurrency(row.heldTotal)}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
                <td>{formatCurrency(row.encTotal)}</td>
                <td>{formatCurrency(row.ytdTotal)}</td>
                <td>{formatCurrency(row.obligatedTotal)}</td>
                <td className={row.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(row.remainingTrue)}</td>
                <td className={row.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(row.remainingIfRequestedApproved)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="panel" style={{ marginBottom: "0.8rem" }}>
        <h2>Banner Code Rollup</h2>
      </article>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Banner Code</th>
              <th>Banner Category</th>
              <th>Banner Name</th>
              <th>Requested (Open)</th>
              <th>Held</th>
              <th>Pending CC</th>
              <th>ENC</th>
              <th>YTD</th>
              <th>Obligated</th>
            </tr>
          </thead>
          <tbody>
            {board.bannerRollups.length === 0 ? (
              <tr>
                <td colSpan={9}>No Banner-code rollups for this project yet.</td>
              </tr>
            ) : null}
            {board.bannerRollups.map((row) => (
              <tr key={`${row.bannerAccountCode}-${row.bannerCategory}-${row.bannerName}`}>
                <td>{row.bannerAccountCode}</td>
                <td>{row.bannerCategory}</td>
                <td>{row.bannerName}</td>
                <td>{formatCurrency(row.requestedTotal)}</td>
                <td>{formatCurrency(row.heldTotal)}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
                <td>{formatCurrency(row.encTotal)}</td>
                <td>{formatCurrency(row.ytdTotal)}</td>
                <td>{formatCurrency(row.obligatedTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
