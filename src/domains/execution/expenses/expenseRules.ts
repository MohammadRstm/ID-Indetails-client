import type { Schemas } from "@/api/types";
import { AMOUNT, largest, QUANTITY, UNIT_COST, upTo } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import { parseDateText } from "@/shared/format/parseDate";
import { companyToday } from "@/shared/format/time";
import type { AccountLabel } from "@/domains/shared/accountLabels/accountLabelsApi";
import type { SiteExpense, SiteExpenseCategory } from "./expensesApi";

/*
 * An expense is an item and a cost: quantity × unit cost when both are known, otherwise a total typed in (a
 * lump-sum payment nobody counted), in dollars or Lebanese pounds, spent on a day, under a category and,
 * optionally, an account label. The sheet holds every cell as the text typed, so these work on text.
 */

export const UNITS = ["bag", "tonne", "m³", "m²", "m", "piece", "litre", "hour", "lot"];

export type Choice = { value: string; label: string };

export const CURRENCIES: Choice[] = [{ value: "USD", label: "USD" }, { value: "LBP", label: "LBP" }];
export const CATEGORIES: (Choice & { value: SiteExpenseCategory })[] = [
    { value: "materials", label: "Materials" }, { value: "contractor", label: "Contractor" }, { value: "equipment", label: "Equipment" },
    { value: "fees", label: "Fees" }, { value: "other", label: "Other" },
];
const categoryOf = (value: string): SiteExpenseCategory => CATEGORIES.find((c) => c.value === value)?.value ?? "materials";

export type Row = {
    /** Which row it is, kept as rows come and go: an expense's own for a recorded one. */
    key: string;
    name: string;
    quantity: string;
    unit: string;
    unitCost: string;
    amount: string;
    currency: string;
    supplier: string;
    /** The day as "yyyy-MM-dd", or what was typed when that isn't a day. */
    spentOn: string;
    category: string;
    /** The account label's id, "" for none. */
    accountLabelId: string;
    note: string;
};
export type ColKey = Exclude<keyof Row, "key">;
/** `money` cells show commas between the thousands as they are typed; `choice` cells are picked from a list. */
export type Col = { k: ColKey; label: string; type: "text" | "num" | "combo" | "choice" | "date"; w: string; dash?: boolean; strong?: boolean; money?: boolean };
export type RowProblems = Partial<Record<ColKey, string>> | null;
/** The options of the cells that are picked from a list, by column. */
export type Choices = Partial<Record<ColKey, Choice[]>>;

export const COLS: Col[] = [
    { k: "name", label: "Item", type: "text", w: "14%" },
    { k: "quantity", label: "Qty", type: "num", w: "6%", dash: true },
    { k: "unit", label: "Unit", type: "combo", w: "7%", dash: true },
    { k: "unitCost", label: "Unit cost", type: "num", w: "8%", dash: true, money: true },
    { k: "amount", label: "Amount", type: "num", w: "9%", strong: true, money: true },
    { k: "currency", label: "Currency", type: "choice", w: "7%" },
    { k: "supplier", label: "Supplier / payee", type: "text", w: "10%" },
    { k: "spentOn", label: "Spent on", type: "date", w: "9%" },
    { k: "category", label: "Category", type: "choice", w: "8%" },
    { k: "accountLabelId", label: "Account label", type: "choice", w: "8%" },
    { k: "note", label: "Note", type: "text", w: "8%" },
];
/** Where Amount sits: the footer's totals line up under it. */
export const TOTAL_AT = COLS.findIndex((c) => c.k === "amount");
/** The cells that are typed in; the others start with a default, so they don't make a blank row a used one. */
const TYPED: ColKey[] = ["name", "quantity", "unit", "unitCost", "amount", "supplier", "note"];

export const BLOCK = 10;

const KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Whether a date cell holds a day ("yyyy-MM-dd") rather than text that isn't one. */
export const isDay = (text: string) => KEY.test(text);

const pos = (v: string) => { const n = Number(v); return n > 0 && Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
// a derived number handed back to a typed cell: precise enough that quantity × unit cost lands on the total
const num = (n: number) => String(Math.round(n * 10000) / 10000);
const decimals = (v: string) => (v.includes(".") ? v.split(".")[1].length : 0);

let made = 0;
/** A row nothing is typed in yet: dollars, spent today, materials, no label. */
export const blankRow = (): Row => ({
    key: `new-${++made}`, name: "", quantity: "", unit: "", unitCost: "", amount: "", currency: "USD", supplier: "",
    spentOn: companyToday(), category: "materials", accountLabelId: "", note: "",
});
export const blankRows = (n: number) => Array.from({ length: n }, blankRow);
export const rowUsed = (r: Row) => TYPED.some((k) => r[k].trim() !== "");

/** Quantity × unit cost when both are given, otherwise the total typed in, otherwise nothing. */
export function costOf(r: Row): number {
    const q = pos(r.quantity), uc = pos(r.unitCost);
    return q && uc ? r2(q * uc) : pos(r.amount);
}

/** What is missing or wrong, by cell; null when the row can be saved. */
export function problems(r: Row): RowProblems {
    const bad: Partial<Record<ColKey, string>> = {};
    if (!r.name.trim()) bad.name = "Say what the item is";
    const q = pos(r.quantity), uc = pos(r.unitCost);
    if (!(q && uc) && !pos(r.amount)) {
        if (q) bad.unitCost = bad.amount = "Add a unit cost or type the amount";
        else if (uc) bad.quantity = bad.amount = "Add a quantity or type the amount";
        else bad.amount = "Type the amount, or a quantity and unit cost";
    }
    if (decimals(r.quantity) > 3) bad.quantity = "At most 3 decimals";
    if (decimals(r.unitCost) > 4) bad.unitCost = "At most 4 decimals";
    // no larger than the API can keep
    if (Number(r.quantity) > largest(QUANTITY)) bad.quantity = upTo(QUANTITY);
    if (Number(r.unitCost) > largest(UNIT_COST)) bad.unitCost = upTo(UNIT_COST);
    if (q && uc ? q * uc > largest(AMOUNT) : Number(r.amount) > largest(AMOUNT)) bad.amount = q && uc ? "Quantity × unit cost is too large" : upTo(AMOUNT);
    // the API's limits, so a long paste is caught before any of it is sent
    for (const [k, max] of [["name", 200], ["unit", 20], ["supplier", 200], ["note", 500]] as const) {
        if (r[k].trim().length > max) bad[k] = `At most ${max} characters`;
    }
    if (!r.spentOn.trim()) bad.spentOn = "Say the day it was spent";
    else if (!isDay(r.spentOn)) bad.spentOn = "Not a date - try 23/9/2026 or Sep 23";
    else if (+r.spentOn.slice(0, 4) < 2000 || +r.spentOn.slice(0, 4) > 2099) bad.spentOn = "Between the years 2000 and 2099";
    return Object.keys(bad).length ? bad : null;
}
export const rowProblems = (r: Row): RowProblems => (rowUsed(r) ? problems(r) : null);

/** The first thing wrong with a row, in the order of its cells. */
export function firstProblem(bad: NonNullable<RowProblems>): string | undefined {
    return COLS.map((c) => bad[c.k]).find((m) => !!m);
}

/**
 * Keeps quantity, unit cost and amount agreeing after `k` changed: with both quantity and unit cost, the amount
 * follows them, and an amount typed over them sets the unit cost instead (amount ÷ quantity), as the API does.
 * Emptying either keeps the last amount, which then stands on its own.
 */
export function link(r: Row, k: ColKey): Row {
    const q = pos(r.quantity), uc = pos(r.unitCost), amount = pos(r.amount);
    if (!(q && uc)) return r;
    if (k === "amount" && amount) return { ...r, unitCost: num(amount / q) };
    return { ...r, amount: num(r2(q * uc)) };
}

/** A typed unit: an exact or leading match from the list, or a unit the list doesn't have, as typed. */
export function resolveUnit(text: string): string {
    const t = text.trim().toLowerCase();
    if (!t) return "";
    return UNITS.find((u) => u === t) ?? UNITS.find((u) => u.startsWith(t)) ?? text.trim();
}

/** The option a pasted cell names, by its value or its label; null when it names none. */
export function resolveChoice(options: Choice[], text: string): string | null {
    const t = text.trim().toLowerCase();
    return options.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t)?.value ?? null;
}

/** What a day cell holds for the text typed in it: the day, or the text itself when it isn't one (the row then says so). */
export const resolveDay = (text: string) => parseDateText(text) ?? text.trim();

/**
 * A block copied from Excel or Sheets: rows by line, columns by tab, from the cell pasted into, in the sheet's
 * column order. A row pasted with quantity and unit cost gets its amount from them, as if typed. A day, currency,
 * category or label cell left empty (or naming none of the choices) keeps what the row already has.
 */
export function pasteInto(rows: Row[], r0: number, c0: number, text: string, cols: Col[], choices: Choices = {}): Row[] {
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    let next = rows.map((r) => ({ ...r }));
    lines.forEach((line, i) => {
        const r = r0 + i;
        while (r >= next.length) next = next.concat(blankRows(BLOCK));
        line.split("\t").forEach((cell, j) => {
            const col = cols[c0 + j];
            if (!col) return;
            const v = cell.trim();
            if (col.type === "choice") {
                const picked = resolveChoice(choices[col.k] ?? [], v);
                if (picked != null) next[r][col.k] = picked;
            } else if (col.type === "date") {
                if (v) next[r][col.k] = resolveDay(v);
            } else {
                next[r][col.k] = col.type === "num" ? v.replace(/[^0-9.]/g, "") : col.type === "combo" ? resolveUnit(v) : v;
            }
        });
        next[r] = link(next[r], "quantity");
    });
    return next;
}

/** A recorded expense as the sheet's cells show it. */
export function rowOf(e: SiteExpense): Row {
    const text = (n: number | null) => (n != null && n > 0 ? String(n) : "");
    return {
        key: `expense-${e.id}`, name: e.name, quantity: text(e.quantity), unit: e.unit ?? "", unitCost: text(e.unitCost), amount: text(e.cost),
        currency: e.currency, supplier: e.supplier ?? "", spentOn: e.spentOn, category: e.category,
        accountLabelId: e.accountLabel ? String(e.accountLabel.id) : "", note: e.note ?? "",
    };
}

/**
 * A row as the API takes it. With quantity and unit cost the API works the amount out, so none is sent. The label
 * always goes, even none: left out, it would clear the one an expense has.
 */
export function entryOf(r: Row): Schemas["SiteExpenseEntryRequest"] {
    const q = pos(r.quantity), uc = pos(r.unitCost);
    const text = (v: string) => v.trim() || null;
    return {
        name: r.name.trim(), quantity: q || null, unit: text(r.unit), unitCost: uc || null,
        amount: q && uc ? null : pos(r.amount) || null, supplier: text(r.supplier), note: text(r.note),
        currency: r.currency, spentOn: r.spentOn, category: categoryOf(r.category), accountLabelId: r.accountLabelId ? Number(r.accountLabelId) : null,
    };
}

/**
 * What a row's label cell can be: no label, the labels that can still be picked, and the row's own label when it has
 * since been archived (it keeps it, but nobody can pick it for another row).
 */
export function labelChoices(labels: AccountLabel[] | undefined, own?: SiteExpense["accountLabel"]): Choice[] {
    const open = (labels ?? []).filter((l) => !l.archived).map((l) => ({ value: String(l.id), label: l.name }));
    const kept = own && !open.some((o) => o.value === String(own.id))
        ? [{ value: String(own.id), label: labels ? `${own.name} (archived)` : own.name }]
        : [];
    return [{ value: "", label: "No label" }, ...open, ...kept];
}

export type CurrencyTotal = { currency: string; total: number };
const dollarsFirst = (a: CurrencyTotal, b: CurrencyTotal) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : a.currency.localeCompare(b.currency));

/** What rows add up to, one total per currency: pounds are never added to dollars. */
export function totalsOf(rows: { currency: string; cost: number }[]): CurrencyTotal[] {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.currency, r2((by.get(r.currency) ?? 0) + r.cost));
    return [...by].map(([currency, total]) => ({ currency, total })).sort(dollarsFirst);
}

/** Two sets of totals as one. */
export const joinTotals = (a: CurrencyTotal[], b: CurrencyTotal[]) => totalsOf([...a, ...b].map((t) => ({ currency: t.currency, cost: t.total })));

/** The API's totals with dollars first, and the dollars shown even when there are none (a site with only pounds). */
export function listTotals(totals: { cost: number; byCurrency: CurrencyTotal[] }): CurrencyTotal[] {
    const rest = totals.byCurrency.filter((t) => t.currency !== "USD");
    return [{ currency: "USD", total: totals.cost }, ...rest].sort(dollarsFirst);
}

/** "$55 + 4,500,000 LBP". */
export const writeTotals = (totals: CurrencyTotal[]) =>
    (totals.length ? totals : [{ currency: "USD", total: 0 }]).map((t) => money.exact(t.total, t.currency)).join(" + ");

/** The cells a server error names (items[2].unitCost) on the rows it was about, kept apart from what the sheet found itself. */
export function serverProblems(rows: Row[], fields: Record<string, string>): RowProblems[] {
    // the API counts the expenses it was sent, which are the rows in use, in order
    const sent = rows.flatMap((r, i) => (rowUsed(r) ? [i] : []));
    const out: RowProblems[] = rows.map(() => null);
    for (const [key, message] of Object.entries(fields)) {
        const named = /^items\[(\d+)\]\.(\w+)$/.exec(key);
        const col = named && COLS.find((c) => c.k === named[2]);
        const at = named ? sent[Number(named[1])] : undefined;
        if (col && at != null) out[at] = { ...out[at], [col.k]: message };
    }
    return out;
}

/** What the sheet found wrong with a row first, then what the API refused. */
export const withServerProblems = (own: RowProblems[], server: RowProblems[]): RowProblems[] =>
    own.map((p, i) => (p || server[i] ? { ...server[i], ...p } : null));
