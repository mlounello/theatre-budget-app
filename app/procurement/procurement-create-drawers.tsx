"use client";

import { useState } from "react";
import { CreateOrderForm } from "@/app/procurement/create-order-form";
import { QuickBatchAddForm } from "@/app/procurement/quick-batch-add-form";
import { SideDrawer } from "@/components/ui/side-drawer";
import type {
  AccountCodeOption,
  OrganizationOption,
  ProcurementBudgetLineOption,
  ProcurementProjectOption,
  ProductionCategoryOption,
  VendorOption
} from "@/lib/db";

export function ProcurementCreateDrawers({
  defaultFiscalYearId,
  projectOptions,
  budgetLineOptions,
  organizationOptions,
  vendors,
  accountCodeOptions,
  productionCategoryOptions
}: {
  defaultFiscalYearId: string;
  projectOptions: ProcurementProjectOption[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  organizationOptions: OrganizationOption[];
  vendors: VendorOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [openDrawer, setOpenDrawer] = useState<"order" | "batch" | null>(null);

  return (
    <>
      <div className="buttonCluster procurementCreateActions">
        <button className="buttonLink buttonPrimary" type="button" onClick={() => setOpenDrawer("order")}>
          Add Order
        </button>
        <button className="buttonLink" type="button" onClick={() => setOpenDrawer("batch")}>
          Quick Batch Add
        </button>
      </div>

      <SideDrawer
        open={openDrawer === "order"}
        onClose={() => setOpenDrawer(null)}
        eyebrow="Procurement"
        title="Add Order"
        description="Create one order with its fiscal-year, project or organization budget, vendor, and workflow status."
        closeLabel="Close add order panel"
      >
        <CreateOrderForm
          defaultFiscalYearId={defaultFiscalYearId}
          projectOptions={projectOptions}
          budgetLineOptions={budgetLineOptions}
          organizationOptions={organizationOptions}
          vendors={vendors}
          accountCodeOptions={accountCodeOptions}
          productionCategoryOptions={productionCategoryOptions}
        />
      </SideDrawer>

      <SideDrawer
        open={openDrawer === "batch"}
        onClose={() => setOpenDrawer(null)}
        eyebrow="Procurement"
        title="Quick Batch Add"
        description="Set shared context once, then add several requisition or credit-card rows together."
        closeLabel="Close quick batch add panel"
      >
        <QuickBatchAddForm
          defaultFiscalYearId={defaultFiscalYearId}
          projectOptions={projectOptions}
          budgetLineOptions={budgetLineOptions}
          organizationOptions={organizationOptions}
          accountCodeOptions={accountCodeOptions}
          productionCategoryOptions={productionCategoryOptions}
        />
      </SideDrawer>
    </>
  );
}
