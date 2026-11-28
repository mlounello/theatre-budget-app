#!/bin/sh
# Assembles one paste-ready rolled-back trial: begin; + migration + trial + rollback.
cd "$(dirname "$0")/.." || exit 1
{ echo "begin;"; cat supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql; echo; sed '1,/^-- Replace YOUR_USER_ID/d' scripts/expense-adjustments-trial.sql; } > scripts/expense-adjustments-trial.generated.sql
echo "Wrote scripts/expense-adjustments-trial.generated.sql"
