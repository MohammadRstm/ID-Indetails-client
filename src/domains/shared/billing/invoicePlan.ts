import { addDays } from "@/shared/format/time";
import type { Project } from "../projects/projectsApi";

/* Writing invoices: what is left to bill, and Auto invoice's split of it into invoices that go out on their own days. */

export const TERMS = [
    { value: "0", label: "Due on receipt" }, { value: "15", label: "Net 15 - due in 15 days" },
    { value: "30", label: "Net 30 - due in 30 days" }, { value: "45", label: "Net 45 - due in 45 days" },
];

/** The terms to offer, with a domain's own default added when it isn't one of them. */
export const termOptions = (days: number) =>
    TERMS.some((t) => +t.value === days) ? TERMS : [...TERMS, { value: String(days), label: `Net ${days} - due in ${days} days` }];

/** What is left to put on invoices, less `drafts` (the total of drafts already written). */
export function leftToInvoice(project: Project, drafts: number): number {
    const b = project.money?.billing;
    // Execution: what is still owed after every payment (on account ones too), less what is invoiced and unpaid
    return project.domain === "execution"
        ? Math.max(0, Math.round((b?.owed ?? 0) - (b?.outstanding ?? 0) - drafts))
        : Math.max(0, (b?.leftToInvoice ?? 0) - drafts);
}

/** `total` in `count` equal amounts, to the cent; the last takes what rounding leaves, so they add up exactly. */
export function splitEqually(total: number, count: number): number[] {
    const cents = Math.round(total * 100);
    const each = Math.floor(cents / count);
    return Array.from({ length: count }, (_, i) => (i < count - 1 ? each : cents - each * (count - 1)) / 100);
}

export type Every = "week" | "fortnight" | "month";

export const EVERY: { value: Every; label: string }[] = [
    { value: "week", label: "Every week" }, { value: "fortnight", label: "Every 2 weeks" }, { value: "month", label: "Every month" },
];

/** The days `count` invoices go out: `first`, then one a week, two weeks or month later each (the 31st is a short month's last day). */
export function planDays(first: string, count: number, every: Every): string[] {
    return Array.from({ length: count }, (_, i) => (every === "month" ? monthsAfter(first, i) : addDays(first, i * (every === "week" ? 7 : 14))));
}

function monthsAfter(day: string, months: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const index = y * 12 + (m - 1) + months;
    const year = Math.floor(index / 12), month = index % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
