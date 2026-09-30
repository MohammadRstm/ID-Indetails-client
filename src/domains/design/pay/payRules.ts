import type { Schemas } from "@/api/types";

/*
 * The pay words the forms show, from the API's own rule (PayRules): a monthly salary works out per hour
 * over 40 paid hours a week, the break included. The API works out the real rate when pay is saved.
 */

export const HOURS_PER_MONTH = 173.33;

export const monthlyToHourly = (salary: number) => salary / HOURS_PER_MONTH;

/** The pay in force on a day: the latest that has started. */
export function currentPay(history: Schemas["PayResponse"][] | undefined, today: string): Schemas["PayResponse"] | undefined {
    return (history ?? []).filter((p) => p.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id)[0];
}
