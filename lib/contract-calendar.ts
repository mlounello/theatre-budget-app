import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CALENDAR_NAME = "Theatre Budget - Contract Check Requests";
const FEED_PURPOSE = "contract-calendar-feed-v1";

type CalendarInstallment = {
  id: string;
  installment_number: number | null;
  status: string | null;
  due_date: string | null;
  mail_by: string | null;
};

type CalendarContract = {
  id: string;
  contractor_name: string;
  contract_role: string | null;
  project_id: string;
  projects: { name?: string | null; season?: string | null } | null;
  contract_installments: CalendarInstallment[] | null;
};

function calendarSecret(): string {
  const value =
    process.env.CONTRACT_CALENDAR_FEED_SECRET?.trim() ??
    process.env.CHECK_REQUEST_TAX_ID_KEY?.trim();
  if (!value || value.length < 16) {
    throw new Error(
      "CONTRACT_CALENDAR_FEED_SECRET or CHECK_REQUEST_TAX_ID_KEY must be configured for the contract calendar feed."
    );
  }
  return value;
}

export function contractCalendarFeedToken(): string {
  return createHmac("sha256", calendarSecret()).update(FEED_PURPOSE).digest("base64url");
}

export function isValidContractCalendarFeedToken(value: string): boolean {
  const expected = Buffer.from(contractCalendarFeedToken());
  const provided = Buffer.from(value);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function addDaysYmd(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compactDate(value: string): string {
  return value.replaceAll("-", "");
}

function statusLabel(value: string | null): string {
  if (value === "check_request_submitted") return "Check Request Submitted";
  if (value === "check_paid") return "Check Paid";
  return "Not Submitted";
}

function foldIcsLine(value: string): string {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (Buffer.byteLength(chunk + character, "utf8") > 73) {
      chunks.push(chunk);
      chunk = ` ${character}`;
    } else {
      chunk += character;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
}

function contractProjectLabel(contract: CalendarContract): string {
  const name = contract.projects?.name?.trim() || "Unknown Production";
  const season = contract.projects?.season?.trim();
  return season ? `${name} (${season})` : name;
}

export function renderContractCalendar(
  contracts: CalendarContract[],
  generatedAt = new Date()
): string {
  const stamp = generatedAt.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Theatre Budget App//Contract Check Requests//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(CALENDAR_NAME)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H"
  ];

  for (const contract of contracts) {
    const installments = [...(contract.contract_installments ?? [])].sort(
      (left, right) => Number(left.installment_number ?? 1) - Number(right.installment_number ?? 1)
    );
    for (const installment of installments) {
      if (!installment.mail_by) continue;
      const project = contractProjectLabel(contract);
      const installmentNumber = Number(installment.installment_number ?? 1);
      const details = [
        `Put the check request in inter-office mail for ${contract.contractor_name}.`,
        `Production: ${project}`,
        contract.contract_role ? `Role: ${contract.contract_role}` : null,
        `Installment: ${installmentNumber}`,
        installment.due_date ? `Payment due: ${installment.due_date}` : null,
        `Status: ${statusLabel(installment.status)}`
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:contract-installment-${installment.id}@theatrebudgetapp.mlounello.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compactDate(installment.mail_by)}`,
        `DTEND;VALUE=DATE:${compactDate(addDaysYmd(installment.mail_by, 1))}`,
        `SUMMARY:${escapeIcsText(`Mail check request: ${contract.contractor_name}`)}`,
        `DESCRIPTION:${escapeIcsText(details)}`,
        `CATEGORIES:${escapeIcsText("Contracts,Check Requests")}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export async function getContractCalendarFeed(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      "id, contractor_name, contract_role, project_id, projects!contracts_project_id_fkey(name, season), contract_installments(id, installment_number, status, due_date, mail_by)"
    )
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return renderContractCalendar((data ?? []) as unknown as CalendarContract[]);
}

