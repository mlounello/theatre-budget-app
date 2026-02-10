export async function GET() {
  const csv = [
    "fiscal_year_name,organization_name,org_code,project_name,season,budget_code,category,line_name,allocated_amount,sort_order",
    "FY 2025-2026,Theatre Department,ORG-THR,Rumors,Fall 2025,11300,Scenic,Scenic,2500,1",
    "FY 2025-2026,Theatre Department,ORG-THR,Rumors,Fall 2025,11305,Costumes,Costumes,1500,2",
    "FY 2025-2026,Theatre Department,ORG-THR,Dolly West's Kitchen,Spring 2026,11300,Scenic,Scenic,3000,1"
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=theatre-budget-import-template.csv"
    }
  });
}
