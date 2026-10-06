import type { Schemas } from "@/api/types";
import { AMOUNT, largest, QUANTITY, UNIT_COST, upTo } from "@/shared/format/limits";
import type { Material } from "./materialsApi";

/*
 * A material is a type and a cost: quantity × unit cost when both are known, otherwise a total typed in (a
 * lump-sum delivery nobody counted). The sheet holds every cell as the text typed, so these work on text.
 */

export const UNITS = ["bag", "tonne", "m³", "m²", "m", "piece", "litre", "hour", "lot"];

export type Row = {
    name: string;
    quantity: string;
    unit: string;
    unitCost: string;
    amount: string;
    clientPrice: string;
    supplier: string;
    note: string;
};
export type ColKey = keyof Row;
export type Col = { k: ColKey; label: string; type: "text" | "num" | "combo"; w: string; dash?: boolean; strong?: boolean };
export type RowProblems = Partial<Record<ColKey, string>> | null;

export const COLS: Col[] = [
    { k: "name", label: "Type", type: "text", w: "24%" },
    { k: "quantity", label: "Qty", type: "num", w: "8%", dash: true },
    { k: "unit", label: "Unit", type: "combo", w: "8%", dash: true },
    { k: "unitCost", label: "Unit cost", type: "num", w: "10%", dash: true },
    { k: "amount", label: "Total", type: "num", w: "11%", strong: true },
    { k: "supplier", label: "Supplier", type: "text", w: "13%" },
    { k: "note", label: "Note", type: "text", w: "13%" },
];
/** Where Total sits: the footer's totals line up under it. */
export const TOTAL_AT = COLS.findIndex((c) => c.k === "amount");
/** What a statement freezes: the type, the cost and the price. */
export const STATED_KEYS: ColKey[] = ["name", "quantity", "unit", "unitCost", "amount", "clientPrice"];

export const BLOCK = 10;

const pos = (v: string) => { const n = Number(v); return n > 0 && Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
// a derived number handed back to a typed cell: precise enough that quantity × unit cost lands on the total
const num = (n: number) => String(Math.round(n * 10000) / 10000);
const decimals = (v: string) => (v.includes(".") ? v.split(".")[1].length : 0);

export const blankRow = (): Row => ({ name: "", quantity: "", unit: "", unitCost: "", amount: "", clientPrice: "", supplier: "", note: "" });
export const blankRows = (n: number) => Array.from({ length: n }, blankRow);
export const rowUsed = (r: Row) => COLS.some((c) => r[c.k].trim() !== "");

/** Quantity × unit cost when both are given, otherwise the total typed in, otherwise nothing. */
export function costOf(r: Row): number {
    const q = pos(r.quantity), uc = pos(r.unitCost);
    return q && uc ? r2(q * uc) : pos(r.amount);
}

/** What is missing or wrong, by cell; null when the row can be saved. */
export function problems(r: Row): RowProblems {
    const bad: Partial<Record<ColKey, string>> = {};
    if (!r.name.trim()) bad.name = "Say what type it is";
    const q = pos(r.quantity), uc = pos(r.unitCost);
    if (!(q && uc) && !pos(r.amount)) {
        if (q) bad.unitCost = bad.amount = "Add a unit cost or type the total";
        else if (uc) bad.quantity = bad.amount = "Add a quantity or type the total";
        else bad.amount = "Type the total, or a quantity and unit cost";
    }
    if (decimals(r.quantity) > 3) bad.quantity = "At most 3 decimals";
    if (decimals(r.unitCost) > 4) bad.unitCost = "At most 4 decimals";
    // no larger than the API can keep
    if (Number(r.quantity) > largest(QUANTITY)) bad.quantity = upTo(QUANTITY);
    if (Number(r.unitCost) > largest(UNIT_COST)) bad.unitCost = upTo(UNIT_COST);
    if (Number(r.clientPrice) > largest(AMOUNT)) bad.clientPrice = upTo(AMOUNT);
    if (q && uc ? q * uc > largest(AMOUNT) : Number(r.amount) > largest(AMOUNT)) bad.amount = q && uc ? "Quantity × unit cost is too large" : upTo(AMOUNT);
    // the API's limits, so a long paste is caught before any of it is sent
    for (const [k, max] of [["name", 200], ["unit", 20], ["supplier", 200], ["note", 500]] as const) {
        if (r[k].trim().length > max) bad[k] = `At most ${max} characters`;
    }
    return Object.keys(bad).length ? bad : null;
}
export const rowProblems = (r: Row): RowProblems => (rowUsed(r) ? problems(r) : null);

/**
 * Keeps quantity, unit cost and total agreeing after `k` changed: with both quantity and unit cost, the total
 * follows them, and a total typed over them sets the unit cost instead (total ÷ quantity), as the API does.
 * Emptying either keeps the last total, which then stands on its own.
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

/**
 * A block copied from Excel or Sheets: rows by line, columns by tab, from the cell pasted into, in the sheet's
 * column order. A row pasted with quantity and unit cost gets its total from them, as if typed.
 */
export function pasteInto(rows: Row[], r0: number, c0: number, text: string, cols: Col[]): Row[] {
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
            next[r][col.k] = col.type === "num" ? v.replace(/[^0-9.]/g, "") : col.type === "combo" ? resolveUnit(v) : v;
        });
        next[r] = link(next[r], "quantity");
    });
    return next;
}

/** A recorded material as the sheet's cells show it. */
export function rowOf(m: Material): Row {
    const text = (n: number | null) => (n != null && n > 0 ? String(n) : "");
    return {
        name: m.name, quantity: text(m.quantity), unit: m.unit ?? "", unitCost: text(m.unitCost), amount: text(m.cost),
        clientPrice: m.clientPrice != null ? String(m.clientPrice) : "", supplier: m.supplier ?? "", note: m.note ?? "",
    };
}

/** A row as the API takes it. With quantity and unit cost the API works the total out, so none is sent. */
export function entryOf(r: Row): Schemas["MaterialEntryRequest"] {
    const q = pos(r.quantity), uc = pos(r.unitCost);
    const text = (v: string) => v.trim() || null;
    return {
        name: r.name.trim(), quantity: q || null, unit: text(r.unit), unitCost: uc || null,
        amount: q && uc ? null : pos(r.amount) || null, supplier: text(r.supplier), note: text(r.note),
    };
}
