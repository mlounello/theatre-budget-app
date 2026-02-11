"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CcReconcileModal } from "@/app/requests/cc-reconcile-modal";
import { RequestRowActions } from "@/app/requests/request-row-actions";
import { formatCurrency } from "@/lib/format";
import type {
  AccountCodeOption,
  ProcurementProjectOption,
  ProductionCategoryOption,
  PurchaseRow,
  RequestReceiptRow
} from "@/lib/db";

type SortKey =
  | "projectName"
  | "productionCategoryName"
  | "bannerAccountCode"
  | "requestNumber"
  | "title"
  | "requestType"
  | "status"
  | "ccWorkflowStatus"
  | "estimatedAmount"
  | "requestedAmount"
  | "encumberedAmount"
  | "pendingCcAmount"
  | "postedAmount"
  | "receiptTotal";

type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = [
  "projectName",
  "productionCategoryName",
  "bannerAccountCode",
  "requestNumber",
  "title",
  "requestType",
  "status",
  "ccWorkflowStatus",
  "estimatedAmount",
  "requestedAmount",
  "encumberedAmount",
  "pendingCcAmount",
  "postedAmount",
  "receiptTotal"
];

function asString(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function sortRows(rows: PurchaseRow[], key: SortKey, direction: SortDirection): PurchaseRow[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aRequestNumber = a.requestType === "requisition" ? a.requisitionNumber : a.referenceNumber;
    const bRequestNumber = b.requestType === "requisition" ? b.requisitionNumber : b.referenceNumber;
    const cmp =
      key === "estimatedAmount" ||
      key === "requestedAmount" ||
      key === "encumberedAmount" ||
      key === "pendingCcAmount" ||
      key === "postedAmount" ||
      key === "receiptTotal"
        ? (a[key] as number) - (b[key] as number)
        : key === "requestNumber"
            ? asString(aRequestNumber).localeCompare(asString(bRequestNumber))
            : asString(a[key] as string | null).localeCompare(asString(b[key] as string | null));
    return cmp * dir;
  });
}

function SortTh({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th>
      <button type="button" className="sortHeaderButton" onClick={() => onToggle(sortKey)}>
        {label} {active ? (direction === "asc" ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

export function RequestsTable({
  purchases,
  receipts,
  projectOptions,
  accountCodeOptions,
  productionCategoryOptions
}: {
  purchases: PurchaseRow[];
  receipts: RequestReceiptRow[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortFromUrl = searchParams.get("rq_sort");
  const dirFromUrl = searchParams.get("rq_dir");
  const initialSortKey: SortKey = sortFromUrl && SORT_KEYS.includes(sortFromUrl as SortKey) ? (sortFromUrl as SortKey) : "projectName";
  const initialDirection: SortDirection = dirFromUrl === "desc" ? "desc" : "asc";
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const sortedPurchases = useMemo(() => sortRows(purchases, sortKey, direction), [purchases, sortKey, direction]);

  function onToggle(key: SortKey): void {
    const nextDirection: SortDirection = key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc";
    const nextKey = key;
    const params = new URLSearchParams(searchParams.toString());
    params.set("rq_sort", nextKey);
    params.set("rq_dir", nextDirection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    if (key === sortKey) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh
              label="Department"
              sortKey="productionCategoryName"
              activeKey={sortKey}
              direction={direction}
              onToggle={onToggle}
            />
            <SortTh
              label="Banner Code"
              sortKey="bannerAccountCode"
              activeKey={sortKey}
              direction={direction}
              onToggle={onToggle}
            />
            <SortTh label="Req/Ref #" sortKey="requestNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Title" sortKey="title" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Type" sortKey="requestType" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh
              label="CC Workflow"
              sortKey="ccWorkflowStatus"
              activeKey={sortKey}
              direction={direction}
              onToggle={onToggle}
            />
            <SortTh label="Estimated" sortKey="estimatedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Requested" sortKey="requestedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="ENC" sortKey="encumberedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Pending CC" sortKey="pendingCcAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Posted" sortKey="postedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <SortTh label="Receipts" sortKey="receiptTotal" activeKey={sortKey} direction={direction} onToggle={onToggle} />
            <th>CC Reconcile</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedPurchases.length === 0 ? (
            <tr>
              <td colSpan={16}>No purchases yet. Create your first request above.</td>
            </tr>
          ) : null}
          {sortedPurchases.map((purchase) => (
            <tr key={purchase.id}>
              <td>{purchase.projectName}</td>
              <td>{purchase.productionCategoryName ?? purchase.category ?? "-"}</td>
              <td>{purchase.bannerAccountCode ?? purchase.budgetCode}</td>
              <td>{purchase.requestType === "requisition" ? (purchase.requisitionNumber ?? "-") : (purchase.referenceNumber ?? "-")}</td>
              <td>{purchase.title}</td>
              <td>
                {purchase.requestType}
                {purchase.requestType === "expense" ? (purchase.isCreditCard ? " (cc)" : " (reimb)") : ""}
              </td>
              <td>
                <span className={`statusChip status-${purchase.status}`}>{purchase.status}</span>
              </td>
              <td>{purchase.isCreditCard ? (purchase.ccWorkflowStatus ?? "requested") : "-"}</td>
              <td>{formatCurrency(purchase.estimatedAmount)}</td>
              <td>{formatCurrency(purchase.requestedAmount)}</td>
              <td>{formatCurrency(purchase.encumberedAmount)}</td>
              <td>{formatCurrency(purchase.pendingCcAmount)}</td>
              <td>{formatCurrency(purchase.postedAmount)}</td>
              <td>
                {purchase.requestType === "expense" ? (
                  <>
                    <strong>{formatCurrency(purchase.receiptTotal)}</strong>
                    <div>{purchase.receiptCount} receipts</div>
                  </>
                ) : (
                  "-"
                )}
              </td>
              <td>
                <CcReconcileModal purchase={purchase} receipts={receipts} />
              </td>
              <td>
                <RequestRowActions
                  purchase={purchase}
                  projectOptions={projectOptions}
                  accountCodeOptions={accountCodeOptions}
                  productionCategoryOptions={productionCategoryOptions}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
