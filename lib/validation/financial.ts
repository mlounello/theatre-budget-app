import { z } from "zod";

const nullableUuidSchema = z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null);

export const positiveMoneySchema = z.coerce
  .number({ invalid_type_error: "Enter a valid amount." })
  .finite("Enter a valid amount.")
  .positive("Amount must be greater than zero.")
  .transform((value) => Math.round(value * 100) / 100);

export const expenseLineInputSchema = z.object({
  expenseNumber: z.string().trim().toUpperCase().regex(/^EX\d{6}$/, "Use the EX###### format."),
  title: z.string().trim().min(1, "Every Expense needs a title.").max(200),
  amount: positiveMoneySchema,
  expenseDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).transform((value) => value || null),
  note: z.union([z.string().trim().max(2000), z.null()]).transform((value) => value || null),
  projectId: nullableUuidSchema,
  organizationId: nullableUuidSchema,
  productionCategoryId: nullableUuidSchema,
  bannerAccountCodeId: z.string().uuid("Choose a Banner account for every Expense.")
}).superRefine((value, context) => {
  if (Boolean(value.projectId) === Boolean(value.organizationId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectId"], message: "Choose exactly one theatre project or organization budget for every Expense." });
  }
  if (value.projectId && !value.productionCategoryId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["productionCategoryId"], message: "Choose a production category for every theatre Expense." });
  }
});

export const expenseClaimInputSchema = z
  .object({
    claimType: z.enum(["funding_request", "monthly_reconciliation", "reimbursement"]),
    fiscalYearId: z.string().uuid("Choose a valid fiscal year."),
    creditCardId: nullableUuidSchema,
    claimNumber: z.string().trim().toUpperCase().regex(/^EC\d{6}$/, "Use the EC###### format."),
    claimMonth: z.union([z.string().regex(/^\d{4}-\d{2}$/), z.literal("")]).transform((value) => value || null),
    authorizationClaimId: nullableUuidSchema,
    overageExplanation: z.string().trim().max(2000).transform((value) => value || null),
    notes: z.string().trim().max(4000).transform((value) => value || null),
    lines: z.array(expenseLineInputSchema).min(1, "Add at least one Expense.").max(100)
  })
  .superRefine((value, context) => {
    if (value.claimType !== "reimbursement" && !value.creditCardId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["creditCardId"], message: "Choose the physical card for this claim." });
    }
    if (value.claimType === "monthly_reconciliation" && !value.authorizationClaimId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["authorizationClaimId"], message: "Link the reconciliation to its original funding request." });
    }
  });

export type ExpenseClaimInput = z.infer<typeof expenseClaimInputSchema>;
