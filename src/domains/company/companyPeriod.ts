import { addDays, fmtDateY, MONTHS_LONG, partsOf } from "@/shared/format/time";

/** The window the Company overview measures: a preset, a year or quarter picked, or any range. */
export type PeriodChoice =
    | { mode: "month" | "quarter" | "year" }
    | { mode: "pick"; year: number; q: number }
    | { mode: "custom"; from: string; to: string };

export type CompanyPeriod = { from: string; to: string; label: string };

/** How many years before this one the company area's pickers reach. */
export const YEARS_BACK = 5;

const pad = (n: number) => String(n).padStart(2, "0");

/** The prototype's HL.companyPeriod: a window never runs past today. */
export function companyPeriod(choice: PeriodChoice, today: string): CompanyPeriod {
    const t = partsOf(today);
    if (choice.mode === "quarter") {
        const q = Math.floor(t.month / 3);
        return { from: `${t.year}-${pad(q * 3 + 1)}-01`, to: today, label: `Q${q + 1} ${t.year} to date` };
    }
    if (choice.mode === "year") return { from: `${t.year}-01-01`, to: today, label: `${t.year} to date` };
    if (choice.mode === "pick") {
        const from = choice.q ? `${choice.year}-${pad((choice.q - 1) * 3 + 1)}-01` : `${choice.year}-01-01`;
        const end = choice.q
            ? addDays(choice.q === 4 ? `${choice.year + 1}-01-01` : `${choice.year}-${pad(choice.q * 3 + 1)}-01`, -1)
            : `${choice.year}-12-31`;
        const running = end > today;
        return { from: from > today ? today : from, to: running ? today : end, label: `${choice.q ? `Q${choice.q} ` : ""}${choice.year}${running ? " to date" : ""}` };
    }
    if (choice.mode === "custom") {
        const to = choice.to > today ? today : choice.to;
        const from = choice.from > to ? to : choice.from;
        return { from, to, label: `${fmtDateY(from)} – ${fmtDateY(to)}` };
    }
    return { from: `${today.slice(0, 7)}-01`, to: today, label: `${MONTHS_LONG[t.month]} ${t.year} to date` };
}

// the window chosen survives moving to Expenses or Salaries and back, as in the prototype
let last: PeriodChoice = { mode: "month" };
export const lastChoice = () => last;
export const rememberChoice = (choice: PeriodChoice) => { last = choice; };
