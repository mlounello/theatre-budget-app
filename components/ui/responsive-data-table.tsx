import type { ReactNode } from "react";

export type ResponsiveDataColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  numeric?: boolean;
};

export function ResponsiveDataTable<Row>({
  rows,
  columns,
  rowKey,
  emptyMessage,
  label
}: {
  rows: Row[];
  columns: Array<ResponsiveDataColumn<Row>>;
  rowKey: (row: Row) => string;
  emptyMessage: string;
  label: string;
}) {
  return (
    <div className="tableWrap responsiveDataTableWrap" role="region" aria-label={label} tabIndex={0}>
      <table className="responsiveDataTable">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="responsiveDataEmpty"><td colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : null}
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label} className={column.numeric ? "numericCell" : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
