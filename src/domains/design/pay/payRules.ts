import type { Schemas } from "@/api/types";

/*
 * The pay words the forms show, from the API's rules (PayRules). A salary is fixed: an hour of it is worth the salary
 * ÷ the month's paid hours, which the API works out month by month. Overtime is paid at a rate set with the pay
 * instead, the same every month: the salary ÷ 184 unless an admin types another.
 */

/** The hours a month a salary's overtime rate is worked out from when the working time sets no overtime threshold. */
export const OVERTIME_HOURS = 184;

/**
 * The overtime rate a salary is given when none is typed, to the cent: what the forms suggest, the salary ÷ the
 * overtime threshold's hours (see useOvertimeHours). The API stores the same when the field is left out, and stays the authority.
 */
export const suggestedOvertimeRate = (salary: number, hours = OVERTIME_HOURS) => Math.round((salary / hours) * 100) / 100;

/** Admins and super admins are paid a fixed monthly salary: they log no hours. */
export const hasFixedSalary = (role: string) => role !== "employee";

/** Execution's site staff log no hours either, so like admins they earn no overtime. */
export const paidMonthlyOnly = (role: string, domain: string | null | undefined) => hasFixedSalary(role) || domain === "execution";

/** The pay in force on a day: the latest active entry that has started (a superseded one was replaced). */
export function currentPay(history: Schemas["PayResponse"][] | undefined, today: string): Schemas["PayResponse"] | undefined {
    return (history ?? [])
        .filter((p) => p.effectiveFrom <= today && !p.supersededAt)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id)[0];
}

/**
 * What a change of currency does, said wherever one is made. The API only lets it start on the 1st of a month, so
 * every month is paid in one currency.
 */
export const CURRENCY_WARNING = "Changing currency is rarely right. It starts on the 1st. Any advance in the old currency stops coming off. "
    + "Months are grouped by their currency. LBP needs an exchange rate in force, or its labour stays unconverted.";
