export type CheckRequestSchedule = {
  dueDate: string;
  checkRunDate: string;
  apReceiveBy: string;
  mailBy: string;
};

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function previousOrSameFriday(date: Date): Date {
  const day = date.getUTCDay();
  const daysSinceFriday = (day + 2) % 7;
  return addDays(date, -daysSinceFriday);
}

function subtractBusinessDays(date: Date, days: number): Date {
  let remaining = days;
  let current = new Date(date);
  while (remaining > 0) {
    current = addDays(current, -1);
    if (isWeekday(current)) remaining -= 1;
  }
  return current;
}

export function calculateCheckRequestSchedule(dueDateValue: string | null | undefined): CheckRequestSchedule | null {
  if (!dueDateValue) return null;
  const dueDate = parseYmd(dueDateValue);
  if (!dueDate) return null;

  const checkRunDate = previousOrSameFriday(dueDate);
  const apReceiveBy = addDays(checkRunDate, -7);
  const mailBy = subtractBusinessDays(apReceiveBy, 2);

  return {
    dueDate: formatYmd(dueDate),
    checkRunDate: formatYmd(checkRunDate),
    apReceiveBy: formatYmd(apReceiveBy),
    mailBy: formatYmd(mailBy)
  };
}
