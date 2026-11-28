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
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f data.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scenario.sql 2>&1 | grep -E "NOTICE|ERROR|CONTEXT"
