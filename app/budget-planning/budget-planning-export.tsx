"use client";

type ExportRow = Record<string, string | number | null>;

function escapeCsvValue(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(headers: string[], rows: ExportRow[]): string {
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(",");
  const lines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  return [headerLine, ...lines].join("\n");
}

export function BudgetPlanningExportButton({
  headers,
  rows,
  filename
}: {
  headers: string[];
  rows: ExportRow[];
  filename: string;
}) {
  const disabled = rows.length === 0;

  return (
    <button
      className="buttonLink"
      type="button"
      disabled={disabled}
      onClick={() => {
        if (rows.length === 0) return;
        const csv = buildCsv(headers, rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }}
      style={{ marginLeft: "0.5rem" }}
    >
      Export CSV
    </button>
  );
}
