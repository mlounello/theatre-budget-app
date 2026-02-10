import type { BudgetLine, Project, Purchase } from "@/lib/types";

export const projects: Project[] = [
  { id: "rumors-fall-2025", name: "Rumors", season: "Fall 2025", status: "active" },
  {
    id: "dolly-west-spring-2026",
    name: "Dolly West's Kitchen",
    season: "Spring 2026",
    status: "active"
  }
];

export const budgetLines: BudgetLine[] = [
  {
    id: "rumors-scenic-11300",
    projectId: "rumors-fall-2025",
    budgetCode: "11300",
    category: "Scenic",
    name: "Scenic",
    allocatedAmount: 2500,
    pendingCcAmount: 140.88,
    encumberedAmount: 52.46,
    ytdAmount: 3132.48,
    requestedOpenAmount: 220
  },
  {
    id: "rumors-costumes-11305",
    projectId: "rumors-fall-2025",
    budgetCode: "11305",
    category: "Costumes",
    name: "Costumes",
    allocatedAmount: 1500,
    pendingCcAmount: 286.3,
    encumberedAmount: 0,
    ytdAmount: 1250.74,
    requestedOpenAmount: 95
  },
  {
    id: "dolly-scenic-11300",
    projectId: "dolly-west-spring-2026",
    budgetCode: "11300",
    category: "Scenic",
    name: "Scenic",
    allocatedAmount: 3000,
    pendingCcAmount: 300,
    encumberedAmount: 0,
    ytdAmount: 120,
    requestedOpenAmount: 480
  },
  {
    id: "dolly-costumes-11305",
    projectId: "dolly-west-spring-2026",
    budgetCode: "11305",
    category: "Costumes",
    name: "Costumes",
    allocatedAmount: 2000,
    pendingCcAmount: 0,
    encumberedAmount: 84.36,
    ytdAmount: 0,
    requestedOpenAmount: 150
  }
];

export const purchases: Purchase[] = [
  {
    id: "req-001",
    projectId: "dolly-west-spring-2026",
    budgetLineId: "dolly-costumes-11305",
    title: "Costume accessories",
    referenceNumber: "REQ-001",
    estimatedAmount: 120,
    requestedAmount: 150,
    encumberedAmount: 0,
    pendingCcAmount: 0,
    postedAmount: 0,
    status: "requested"
  },
  {
    id: "cc-2026-01-01",
    projectId: "rumors-fall-2025",
    budgetLineId: "rumors-scenic-11300",
    title: "Home Depot scenic materials",
    referenceNumber: "EC000654",
    estimatedAmount: 0,
    requestedAmount: 0,
    encumberedAmount: 0,
    pendingCcAmount: 140.88,
    postedAmount: 0,
    status: "pending_cc"
  }
];
