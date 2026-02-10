export type AppRole = "admin" | "project_manager" | "buyer" | "viewer";

export type PurchaseStatus =
  | "requested"
  | "encumbered"
  | "pending_cc"
  | "posted"
  | "cancelled";

export type BudgetLine = {
  id: string;
  projectId: string;
  budgetCode: string;
  category: string;
  name: string;
  allocatedAmount: number;
  pendingCcAmount: number;
  encumberedAmount: number;
  ytdAmount: number;
  requestedOpenAmount: number;
};

export type Project = {
  id: string;
  name: string;
  season: string;
  status: "active" | "archived";
};

export type Purchase = {
  id: string;
  projectId: string;
  budgetLineId: string;
  title: string;
  referenceNumber: string;
  estimatedAmount: number;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  status: PurchaseStatus;
};
