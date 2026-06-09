"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GLOBAL_FISCAL_YEAR_STORAGE_KEY } from "@/lib/fiscal-year-context";

type FiscalYearChoice = {
  id: string;
  name: string;
};

export function GlobalFiscalYearPicker({
  fiscalYears,
  defaultFiscalYearId
}: {
  fiscalYears: FiscalYearChoice[];
  defaultFiscalYearId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const validIds = useMemo(() => new Set(fiscalYears.map((fy) => fy.id)), [fiscalYears]);
  const urlFiscalYearId = searchParams.get("fiscalYearId") ?? "";
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState(urlFiscalYearId || defaultFiscalYearId);

  useEffect(() => {
    if (fiscalYears.length === 0) return;
    const saved = window.localStorage.getItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY) ?? "";
    const next = validIds.has(urlFiscalYearId) ? urlFiscalYearId : validIds.has(saved) ? saved : defaultFiscalYearId;
    if (!next) return;
    setSelectedFiscalYearId(next);
    window.localStorage.setItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY, next);

    if (!urlFiscalYearId && pathname !== "/login") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("fiscalYearId", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [defaultFiscalYearId, fiscalYears.length, pathname, router, searchParams, urlFiscalYearId, validIds]);

  function changeFiscalYear(next: string): void {
    setSelectedFiscalYearId(next);
    window.localStorage.setItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY, next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("fiscalYearId", next);
    params.delete("fy");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (fiscalYears.length === 0) return null;

  return (
    <label className="globalFyPicker">
      <span>Fiscal Year</span>
      <select value={selectedFiscalYearId} onChange={(event) => changeFiscalYear(event.target.value)}>
        {fiscalYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {fy.name}
          </option>
        ))}
      </select>
    </label>
  );
}
