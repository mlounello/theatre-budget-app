"use client";

import { useState } from "react";
import { CreateContractBatchForm } from "@/app/contracts/create-contract-batch-form";
import { CreateContractForm } from "@/app/contracts/create-contract-form";
import { SideDrawer } from "@/components/ui/side-drawer";
import type {
  AccountCodeOption,
  FiscalYearOption,
  FoapalOption,
  GuestArtistOption,
  OrganizationOption,
  ProcurementProjectOption,
  UnionAgreementOption
} from "@/lib/db";

export function CreateHiringDrawers({
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions,
  foapalOptions,
  guestArtistOptions,
  unionAgreementOptions
}: {
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  foapalOptions: FoapalOption[];
  guestArtistOptions: GuestArtistOption[];
  unionAgreementOptions: UnionAgreementOption[];
}) {
  const [open, setOpen] = useState<"single" | "bulk" | null>(null);
  return (
    <>
      <div className="buttonCluster">
        <button type="button" className="buttonLink buttonPrimary" onClick={() => setOpen("single")}>Add Hire</button>
        <button type="button" className="buttonLink" onClick={() => setOpen("bulk")}>Bulk Add</button>
      </div>
      <SideDrawer open={open === "single"} onClose={() => setOpen(null)} eyebrow="Hiring" title="Add Hire" description="Choose the hiring path, compensation schedule, project, and institutional budget coding.">
        <CreateContractForm
          fiscalYearOptions={fiscalYearOptions}
          organizationOptions={organizationOptions}
          projectOptions={projectOptions}
          accountCodeOptions={accountCodeOptions}
          foapalOptions={foapalOptions}
          guestArtistOptions={guestArtistOptions}
          unionAgreementOptions={unionAgreementOptions}
        />
      </SideDrawer>
      <SideDrawer open={open === "bulk"} onClose={() => setOpen(null)} eyebrow="Hiring" title="Bulk Add Hires" description="Add several independent contractor records with shared project and account coding.">
        <CreateContractBatchForm
          fiscalYearOptions={fiscalYearOptions}
          organizationOptions={organizationOptions}
          projectOptions={projectOptions}
          accountCodeOptions={accountCodeOptions}
        />
      </SideDrawer>
    </>
  );
}
