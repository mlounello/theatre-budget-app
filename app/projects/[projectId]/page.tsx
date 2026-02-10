import { notFound } from "next/navigation";
import { budgetLines, projects } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectBudgetBoardPage({ params }: Props): Promise<JSX.Element> {
  const { projectId } = await params;
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    notFound();
  }

  const lines = budgetLines.filter((line) => line.projectId === projectId);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Project Budget Board</p>
        <h1>{project.name}</h1>
        <p className="heroSubtitle">Spreadsheet-equivalent rollups with explicit status totals.</p>
      </header>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
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
            {lines.map((line) => {
              const obligated = line.pendingCcAmount + line.encumberedAmount + line.ytdAmount;
              const remainingTrue = line.allocatedAmount - obligated;
              const remainingIfRequestedApproved = remainingTrue - line.requestedOpenAmount;

              return (
                <tr key={line.id}>
                  <td>{line.category}</td>
                  <td>{line.budgetCode}</td>
                  <td>{formatCurrency(line.allocatedAmount)}</td>
                  <td>{formatCurrency(line.pendingCcAmount)}</td>
                  <td>{formatCurrency(line.encumberedAmount)}</td>
                  <td>{formatCurrency(line.ytdAmount)}</td>
                  <td>{formatCurrency(obligated)}</td>
                  <td className={remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(remainingTrue)}</td>
                  <td>{formatCurrency(line.requestedOpenAmount)}</td>
                  <td className={remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                    {formatCurrency(remainingIfRequestedApproved)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
