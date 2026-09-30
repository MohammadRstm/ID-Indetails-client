/*
 * Dates, times and durations, written the way the prototype writes them (hourline/js/00-util.js).
 *
 * The API sends instants in UTC and calendar days as "yyyy-MM-dd". Instants are shown in the company's
 * time zone (company settings), so everyone sees the same day and hour whatever their computer says.
 * Calendar days are never shifted.
 */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type FormatSettings = {
    timeZone: string;
    use24HourTime: boolean;
    /** 0 = weeks start on Sunday, 1 = Monday. */
    weekStart: number;
};

let settings: FormatSettings = { timeZone: "Asia/Beirut", use24HourTime: false, weekStart: 1 };
let partsFormatter = makeFormatter(settings.timeZone);

/** Called once the company settings are loaded. */
export function setFormatSettings(next: Partial<FormatSettings>) {
    settings = { ...settings, ...next };
    partsFormatter = makeFormatter(settings.timeZone);
}

export function formatSettings(): FormatSettings {
    return settings;
}

function makeFormatter(timeZone: string) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hourCycle: "h23",
    });
}

/** A calendar day or an instant, as the API sends them. */
export type DateValue = Date | string | number;

/** The year, month (0-11), day, weekday, hour and minute of a value, in the company time zone. */
export type DateParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function partsOf(value: DateValue): DateParts {
    if (typeof value === "string") {
        const key = DAY_KEY.exec(value);
        if (key) {
            const year = +key[1], month = +key[2] - 1, day = +key[3];
            return { year, month, day, weekday: new Date(Date.UTC(year, month, day)).getUTCDay(), hour: 0, minute: 0 };
        }
    }

    const date = value instanceof Date ? value : new Date(value);
    const map: Record<string, number> = {};
    for (const part of partsFormatter.formatToParts(date)) {
        if (part.type !== "literal") map[part.type] = +part.value;
    }

    const year = map.year, month = map.month - 1, day = map.day;
    return { year, month, day, weekday: new Date(Date.UTC(year, month, day)).getUTCDay(), hour: map.hour, minute: map.minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "yyyy-MM-dd" of the company day a value falls on. */
export function dayKey(value: DateValue): string {
    const p = partsOf(value);
    return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}

/** "yyyy-MM" of the company month a value falls on. */
export function monthKey(value: DateValue): string {
    return dayKey(value).slice(0, 7);
}

/** Today in the company time zone, as "yyyy-MM-dd". */
export function companyToday(now: Date = new Date()): string {
    return dayKey(now);
}

/** Adds days to a "yyyy-MM-dd" key. */
export function addDays(key: string, days: number): string {
    const p = partsOf(key);
    const d = new Date(Date.UTC(p.year, p.month, p.day + days));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Adds months to a "yyyy-MM" key. */
export function addMonths(month: string, months: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + months, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Whole days from one "yyyy-MM-dd" key to another. */
export function daysBetween(from: string, to: string): number {
    const a = partsOf(from), b = partsOf(to);
    return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000);
}

/** The first day of the company week that contains a day. */
export function startOfWeek(key: string): string {
    const p = partsOf(key);
    return addDays(key, -((p.weekday - settings.weekStart + 7) % 7));
}

export function fmtTime(value: DateValue): string {
    const p = partsOf(value);
    return clockTime(p.hour, p.minute);
}

/** 9:30 AM (or 09:30), from minutes after midnight. */
export function fmtMinutes(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return clockTime(Math.floor(m / 60), m % 60);
}

function clockTime(hour: number, minute: number): string {
    if (settings.use24HourTime) return `${pad(hour)}:${pad(minute)}`;
    const ap = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${pad(minute)} ${ap}`;
}

export function fmtRange(from: DateValue, to: DateValue): string {
    return `${fmtTime(from)} → ${fmtTime(to)}`;
}

/** 45m, 1h 05m. */
export function fmtDur(minutes: number): string {
    const m = Math.round(minutes);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** 45m, 2h, 2h 05m. */
export function fmtDurShort(minutes: number): string {
    const m = Math.round(minutes);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60), rest = m % 60;
    return rest === 0 ? `${h}h` : `${h}h ${pad(rest)}m`;
}

/** Hours for totals: 7h 30m, 1,240h, 12.5kh. */
export function fmtH(minutes: number): string {
    if (minutes >= 600_000) return `${compactNumber(minutes / 60)}h`;
    if (minutes >= 6000) return `${Math.round(minutes / 60).toLocaleString("en-US")}h`;
    return fmtDurShort(minutes);
}

export function fmtHoursNum(minutes: number, decimals?: number): string {
    const h = minutes / 60;
    return h.toFixed(decimals ?? (h >= 100 ? 0 : 1));
}

export function fmtNumber(value: number): string {
    return Number(value).toLocaleString("en-US");
}

export function pct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

/** Sep 23 */
export function fmtDate(value: DateValue): string {
    const p = partsOf(value);
    return `${MONTHS[p.month]} ${p.day}`;
}

/** Sep 23, 2026 */
export function fmtDateY(value: DateValue): string {
    const p = partsOf(value);
    return `${MONTHS[p.month]} ${p.day}, ${p.year}`;
}

/** Wed, Sep 23 */
export function fmtDayDate(value: DateValue): string {
    const p = partsOf(value);
    return `${DAYS[p.weekday]}, ${MONTHS[p.month]} ${p.day}`;
}

/** Wednesday, September 23, 2026 */
export function fmtDayDateY(value: DateValue): string {
    const p = partsOf(value);
    return `${DAYS_LONG[p.weekday]}, ${MONTHS_LONG[p.month]} ${p.day}, ${p.year}`;
}

/** September 2026, from a value or a "yyyy-MM" key. */
export function fmtMonthY(value: DateValue): string {
    const p = typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? partsOf(`${value}-01`) : partsOf(value);
    return `${MONTHS_LONG[p.month]} ${p.year}`;
}

/** 3 hours ago, yesterday, 2 weeks ago. */
export function relTime(value: DateValue, now: Date = new Date()): string {
    const mins = Math.round((now.getTime() - toTime(value)) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const days = Math.round(h / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) {
        const w = Math.round(days / 7);
        return `${w} week${w === 1 ? "" : "s"} ago`;
    }
    const mo = Math.round(days / 30);
    if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
    return `${Math.round(mo / 12)}y ago`;
}

/** Today, Yesterday, a weekday within the week, otherwise Sep 23. */
export function relDay(value: DateValue, now: Date = new Date()): string {
    const diff = daysBetween(dayKey(value), dayKey(now));
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff > 0 && diff < 7) return DAYS_LONG[partsOf(value).weekday];
    return fmtDate(value);
}

/** 5m ago, 3h ago, 2d ago. */
export function lastSeen(value: DateValue, now: Date = new Date()): string {
    const mins = Math.round((now.getTime() - toTime(value)) / 60_000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
}

function toTime(value: DateValue): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    return new Date(value).getTime();
}

/* Big numbers as 1.2k, 3.45M. Shared with the money formats. */
const UNITS: [number, string][] = [[1e3, "k"], [1e6, "M"], [1e9, "B"], [1e12, "T"]];

function trimZeros(text: string): string {
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/**
 * 1,000 and up in short form; null below that. `precise` keeps three significant figures (money in tables),
 * otherwise two at most (chart axes, tiles). A value that rounds past 999 of a unit moves to the next.
 */
export function compactOrNull(value: number, precise: boolean): string | null {
    if (Math.round(value) < 1000) return null;
    let i = 0;
    while (i < UNITS.length - 1 && value >= UNITS[i + 1][0]) i++;
    for (;;) {
        const x = value / UNITS[i][0];
        const d = precise ? (x < 10 ? 2 : x < 100 ? 1 : 0) : x < 10 ? 1 : 0;
        const r = +x.toFixed(d);
        if (r >= 1000 && i < UNITS.length - 1) {
            i++;
            continue;
        }
        return trimZeros(r.toFixed(d)) + UNITS[i][1];
    }
}

export const MINUS = "−";

export function compactNumber(value: number, precise = true): string {
    const c = compactOrNull(Math.abs(value), precise);
    return c == null ? fmtNumber(Math.round(value)) : (value < 0 ? MINUS : "") + c;
}
