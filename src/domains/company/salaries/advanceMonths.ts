import { errorMessage, toApiError } from "@/api/errors";
import { money } from "@/shared/format/money";
import { addMonths, companyToday } from "@/shared/format/time";
import type { PlannedMonth, SalaryAdvanceMonth } from "./salaryAdvancesApi";

/** One month an advance comes off: `month` is "yyyy-MM", `amount` what is typed (nothing yet is null). */
export type PlanRow = { month: string; amount: number | null };

/**
 * Where an advance comes off, as it is being edited. Not spread: all of it in one month. Spread: an amount for each
 * of several months running on from the first.
 */
export type MonthsPlan = { spread: boolean; rows: PlanRow[] };

/** The first month an advance can come off: this month. */
export const firstMonth = () => companyToday().slice(0, 7);

/** "2026-09-01" or "2026-09" as the month key "2026-09". */
export const monthKey = (day: string) => day.slice(0, 7);

/** All of it in one month, which is the default. */
export const wholeIn = (month: string): MonthsPlan => ({ spread: false, rows: [{ month, amount: null }] });

/** The plan an advance already has for the months still open: spread when there is more than one. */
export function planOfOpen(months: SalaryAdvanceMonth[], first: string): MonthsPlan {
    const open = months.filter((m) => !m.closed).map((m) => ({ month: monthKey(m.month), amount: m.planned }));
    return open.length > 1 ? { spread: true, rows: open } : wholeIn(open[0]?.month ?? first);
}

/** Spreading starts with all of it in the first month and an empty next month to move some into. */
export function spreadOut(plan: MonthsPlan, total: number): MonthsPlan {
    const month = plan.rows[0].month;
    return { spread: true, rows: [{ month, amount: total > 0 ? total : null }, { month: addMonths(month, 1), amount: null }] };
}

export function collapse(plan: MonthsPlan): MonthsPlan {
    return wholeIn(plan.rows[0].month);
}

export function addRow(plan: MonthsPlan): MonthsPlan {
    return { ...plan, rows: [...plan.rows, { month: addMonths(plan.rows[plan.rows.length - 1].month, 1), amount: null }] };
}

/** What the months add up to, to the cent, for showing next to what must be planned. The API decides what is valid. */
export function plannedSum(plan: MonthsPlan): number {
    return Math.round(plan.rows.reduce((t, r) => t + (r.amount ?? 0), 0) * 100) / 100;
}

/** Whether what is planned covers what must be planned. */
export function covers(plan: MonthsPlan, mustPlan: number): boolean {
    return !plan.spread || Math.abs(plannedSum(plan) - mustPlan) < 0.005;
}

/** The months as the API takes them: the first day of each month, months with nothing in them left out. */
export function monthsRequest(plan: MonthsPlan, total: number): PlannedMonth[] {
    if (!plan.spread) return [{ month: `${plan.rows[0].month}-01`, amount: total }];
    return plan.rows.filter((r) => (r.amount ?? 0) > 0).map((r) => ({ month: `${r.month}-01`, amount: r.amount! }));
}

/** An advance's amount with its currency and cents. */
export const amountOf = (value: number, currency: string) => money.exact(value, currency, { cents: true });

/**
 * What a refused request says, placed on the field it is about. Anything about the form as a whole (another advance
 * still open, already decided) is left for the foot of the window.
 */
export function failureOf(error: unknown, options: { overPayOnAmount?: boolean } = {}) {
    const none = { amount: undefined as string | undefined, months: undefined as string | undefined, givenOn: undefined as string | undefined, form: null as string | null };
    if (!error) return none;
    const refused = toApiError(error);
    const fields = refused.fieldErrors;
    const amount = fields.amount ?? (options.overPayOnAmount && refused.code === "salary_advance_over_pay" ? refused.message : undefined);
    const months = fields.months ?? Object.entries(fields).find(([key]) => key.startsWith("months"))?.[1];
    const givenOn = fields.givenOn;
    return { amount, months, givenOn, form: amount || months || givenOn ? null : errorMessage(error) };
}
