import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { getProjectBudgetBoard } from "@/lib/db";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectBudgetBoardPage({ params }: Props) {
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
        <p className="heroSubtitle">Spreadsheet-equivalent rollups with explicit status totals.</p>
      </header>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Line</th>
              <th>Budget Code</th>
              <th>Allocated</th>
              <th>Pending CC</th>
              <th>ENC</th>
              <th>YTD</th>
              <th>Obligated</th>
              <th>Remaining (True)</th>
              <th>Requested (Open)</th>
              <th>Remaining if Requested Approved</th>
            </tr>
          </thead>
          <tbody>
            {board.lines.length === 0 ? (
              <tr>
                <td colSpan={11}>No budget lines for this project yet.</td>
              </tr>
            ) : null}
            {board.lines.map((line) => (
              <tr key={line.projectBudgetLineId}>
                <td>{line.category}</td>
                <td>{line.lineName}</td>
                <td>{line.budgetCode}</td>
                <td>{formatCurrency(line.allocatedAmount)}</td>
                <td>{formatCurrency(line.pendingCcTotal)}</td>
                <td>{formatCurrency(line.encTotal)}</td>
                <td>{formatCurrency(line.ytdTotal)}</td>
                <td>{formatCurrency(line.obligatedTotal)}</td>
                <td className={line.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(line.remainingTrue)}</td>
                <td>{formatCurrency(line.requestedOpenTotal)}</td>
                <td className={line.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(line.remainingIfRequestedApproved)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
