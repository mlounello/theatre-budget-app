import { read, utils } from "xlsx";

export type ArgosYtdControl = {
  fiscalYear: string;
  organizationCode: string;
  accountCode: string;
  total: number;
  rowCount: number;
};

export type ArgosEncControl = {
  accountCode: string;
  total: number;
};

export type BannerFinanceEncRow = {
  documentNumber: string;
  transactionDate: string;
  activityDate: string;
  description: string;
  amount: number;
  ruleClassCode: string;
};

export type BannerFinanceEncDocument = {
  documentNumber: string;
  description: string;
  amount: number;
  lineCount: number;
  ruleClassCodes: string[];
};

export type BannerFinanceEncReport = {
  fiscalYear: string;
  organizationCode: string;
  accountCode: string;
  asOfDate: string;
  total: number;
  reportedTotal: number | null;
  rows: BannerFinanceEncRow[];
  documents: BannerFinanceEncDocument[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
function money(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? "").replaceAll(",", "").replaceAll("$", "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function isoDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!us) return "";
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

function csvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((cell) => cell.trim().replace(/^\uFEFF/, "").toUpperCase());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])));
}

export function parseArgosYtdControlCsv(text: string): ArgosYtdControl {
  const records = csvRecords(text);
  if (records.length === 0 || !("DOC_CODE" in records[0]) || !("TRANS_AMT" in records[0])) {
    throw new Error("This is not an Evisions Argos YTD detail CSV.");
  }
  let total = 0;
  let rowCount = 0;
  for (const record of records) {
    const raw = money(record.TRANS_AMT);
    if (raw === null || !record.DOC_CODE) continue;
    total += record.DR_CR_IND === "-" ? -Math.abs(raw) : raw;
    rowCount += 1;
  }
  if (rowCount === 0) throw new Error("The Argos YTD file does not contain transaction rows.");
  const first = records[0];
  return {
    fiscalYear: first.FISCAL_YEAR ?? "",
    organizationCode: (first.ORGN_CODE ?? "").toUpperCase(),
    accountCode: (first.ACCT_CODE ?? "").toUpperCase(),
    total: Math.round(total * 100) / 100,
    rowCount
  };
}

export function parseArgosEncControlCsv(text: string): ArgosEncControl {
  const records = csvRecords(text);
  if (records.length === 0 || !("ACCOUNT_CODE" in records[0]) || !("TRANS_AMT" in records[0])) {
    throw new Error("This is not an Evisions Argos ENC control CSV.");
  }
  let total = 0;
  for (const record of records) {
    const amount = money(record.TRANS_AMT);
    if (amount !== null) total += amount;
  }
  return {
    accountCode: (records[0].ACCOUNT_CODE ?? "").toUpperCase(),
    total: Math.round(total * 100) / 100
  };
}

function metadataValue(matrix: unknown[][], label: string): string {
  const row = matrix.find((entry) => String(entry[0] ?? "").trim().toLowerCase() === label.toLowerCase());
  return String(row?.[1] ?? "").trim();
}

function leadingCode(value: string): string {
  return value.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

export function parseBannerFinanceEncWorkbook(data: ArrayBuffer): BannerFinanceEncReport {
  if (data.byteLength > 8_000_000) throw new Error("The Banner Finance workbook is larger than 8 MB.");
  const workbook = read(data, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The Banner Finance workbook does not contain a worksheet.");
  const matrix = utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: ""
  });
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map((cell) => String(cell ?? "").trim().toLowerCase());
    return normalized.includes("transaction date") && normalized.includes("document code") && normalized.includes("amount") && normalized.includes("rule class code");
  });
  if (headerIndex < 0) throw new Error("This is not a Banner Finance Transaction Detail workbook.");
  const headers = matrix[headerIndex].map((cell) => String(cell ?? "").trim().toLowerCase());
  const column = (name: string): number => headers.indexOf(name.toLowerCase());
  const rows: BannerFinanceEncRow[] = [];
  let reportedTotal: number | null = null;
  for (const source of matrix.slice(headerIndex + 1)) {
    const first = String(source[0] ?? "").trim();
    if (/^report total/i.test(first)) {
      reportedTotal = money(source[column("amount")]);
      break;
    }
    const documentNumber = String(source[column("document code")] ?? "").trim().toUpperCase();
    const amount = money(source[column("amount")]);
    if (!documentNumber || amount === null) continue;
    rows.push({
      documentNumber,
      transactionDate: isoDate(source[column("transaction date")]),
      activityDate: isoDate(source[column("activity date")]),
      description: String(source[column("vendor/transaction description")] ?? "").trim(),
      amount,
      ruleClassCode: String(source[column("rule class code")] ?? "").trim().toUpperCase()
    });
  }
  if (rows.length === 0) throw new Error("No Banner ENC detail lines were found in the workbook.");
  const grouped = new Map<string, BannerFinanceEncDocument>();
  for (const row of rows) {
    const current = grouped.get(row.documentNumber) ?? {
      documentNumber: row.documentNumber,
      description: row.description,
      amount: 0,
      lineCount: 0,
      ruleClassCodes: []
    };
    current.amount = Math.round((current.amount + row.amount) * 100) / 100;
    current.lineCount += 1;
    if (row.ruleClassCode && !current.ruleClassCodes.includes(row.ruleClassCode)) current.ruleClassCodes.push(row.ruleClassCode);
    grouped.set(row.documentNumber, current);
  }
  const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return {
    fiscalYear: metadataValue(matrix, "Fiscal Year"),
    organizationCode: leadingCode(metadataValue(matrix, "Organization")),
    accountCode: leadingCode(metadataValue(matrix, "Account")),
    asOfDate: isoDate(metadataValue(matrix, "As of Date")),
    total,
    reportedTotal,
    rows,
    documents: [...grouped.values()].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber))
  };
}
