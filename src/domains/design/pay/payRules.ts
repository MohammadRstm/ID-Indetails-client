import type { Schemas } from "@/api/types";

/*
 * The pay words the forms show, from the API's rules (PayRules). A salary is fixed: an hour of it is worth the salary
 * ÷ the month's paid hours, which the API works out month by month. Overtime is paid at the true hourly rate instead,
 * the same every month: the salary ÷ a standard month's paid hours, 40 a week × 52 ÷ 12 on a full-time week.
 */

/** A standard month's paid hours on a 40-hour week (the break included): 173.3. */
export const HOURS_PER_MONTH = (40 * 52) / 12;

/** The true hourly rate of a full-time salary, which overtime is paid at. */
export const monthlyToHourly = (salary: number) => salary / HOURS_PER_MONTH;

/** Admins and super admins are paid a fixed monthly salary: they log no hours. */
export const hasFixedSalary = (role: string) => role !== "employee";

/** Execution's site staff log no hours either, so they are paid by the month too (the API refuses an hourly pay). */
export const paidMonthlyOnly = (role: string, domain: string | null | undefined) => hasFixedSalary(role) || domain === "execution";

/** The pay in force on a day: the latest that has started. */
export function currentPay(history: Schemas["PayResponse"][] | undefined, today: string): Schemas["PayResponse"] | undefined {
    return (history ?? []).filter((p) => p.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id)[0];
}
