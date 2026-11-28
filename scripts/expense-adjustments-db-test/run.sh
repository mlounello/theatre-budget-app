#!/bin/sh
# Runs the expense-adjustment migration against throwaway stub tables on a LOCAL scratch Postgres
# (needs a server such as Homebrew postgresql@17; never touches Supabase).
# Usage: PGHOST=/tmp PGPORT=54399 PGUSER=postgres ./scripts/expense-adjustments-db-test/run.sh
set -e
cd "$(dirname "$0")"
: "${PGHOST:?set PGHOST}"; : "${PGPORT:?set PGPORT}"; : "${PGUSER:=postgres}"
DB=expense_adjustments_test
dropdb --if-exists "$DB" && createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f budget_stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f data.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scenario.sql 2>&1 | grep -E "NOTICE|ERROR|CONTEXT"

# Part 2: Edit Budget for project Expenses (real allocation trigger; reproduces the pre-fix failure, then verifies the fix)
BDB=${DB}_budget
dropdb --if-exists "$BDB" && createdb "$BDB"
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f data.sql
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f budget_stub.sql
sed -n '/^create or replace function app_theatre_budget.validate_purchase_allocation_target/,/^\$\$;/p' ../../supabase/migrations/20261021220000_independent_purchase_allocation_scope.sql | psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f -
psql -q -d "$BDB" -c "create trigger purchase_allocation_scope before insert or update on app_theatre_budget.purchase_allocations for each row execute function app_theatre_budget.validate_purchase_allocation_target()"
sed -n '/^create or replace function app_theatre_budget.update_expense_budget_destination/,/^\$\$;/p' ../../supabase/migrations/20260924143000_edit_expense_budget_destinations.sql | psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f -
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f budget_scenario.sql 2>&1 | grep -E "NOTICE|ERROR|CONTEXT"
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f ../../supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$BDB" -f budget_after.sql 2>&1 | grep -E "NOTICE|ERROR|CONTEXT"
