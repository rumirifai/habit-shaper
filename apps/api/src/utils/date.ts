const WIB_TIME_ZONE = "Asia/Jakarta";

/** Returns today's calendar date in WIB as YYYY-MM-DD. */
export function todayWIB(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Converts a validated YYYY-MM-DD date to a UTC-midnight Date for Prisma DATE columns. */
export function dateOnlyToUTC(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Returns the WIB calendar date for a timestamp. */
export function toWIBDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Adds calendar days to an ISO date without local-time or DST effects. */
export function addDays(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Returns the Monday (YYYY-MM-DD) of the ISO week containing a WIB calendar date. */
export function mondayOfWeekWIB(refDate: string): string {
  const [year, month, day] = refDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Tanggal harus berformat YYYY-MM-DD.");
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const isoWeekday = weekday === 0 ? 7 : weekday;
  date.setUTCDate(date.getUTCDate() - (isoWeekday - 1));
  return date.toISOString().slice(0, 10);
}
