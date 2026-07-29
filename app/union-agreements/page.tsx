import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getFoapalOptions, getUnionAgreementOptions, getUnionFundOptions } from "@/lib/db";
import { UnionAgreementManager } from "@/app/union-agreements/union-agreement-manager";

export const dynamic = "force-dynamic";

export default async function UnionAgreementsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const [funds, agreements, foapals] = await Promise.all([
    getUnionFundOptions(),
    getUnionAgreementOptions(),
    getFoapalOptions()
  ]);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Contracts</p>
        <h1>Union Agreements</h1>
        <p className="heroSubtitle">
          Manage versioned contribution rules and the payee/W-9 profile used for each separate union-fund check.
        </p>
      </header>
      <UnionAgreementManager funds={funds} agreements={agreements} foapals={foapals} />
    </section>
  );
}
