import type { Schemas } from "@/api/types";
import { fitNumber, type NumberShape } from "@/shared/format/limits";
import {
    BOQ_CODE_MAX, BOQ_DESCRIPTION_MAX, BOQ_MAX_LINES, BOQ_REASON_MAX, BOQ_TITLE_MAX, BOQ_UNIT_MAX,
    type Boq, type BoqAdjustmentType, type BoqKind, type BoqLine, type BoqLineNature,
} from "./boqsApi";

/*
 * A BOQ as it is being typed in, like the expenses sheet: rows of text, ten blank ones more each time the last is
 * used, and the blank ones left out when it is saved. Every figure that comes out of the numbers (final quantity,
 * line total, subtotal, adjustment, total, supervision, TVA) is worked out here as it is typed, the way the API works
 * it out (BoqRules, ExecutionPricing); the API works them out again when it is saved, and its figures are kept.
 */

export type LineDraft = {
    /** Stable while it is edited: the saved line's id, or a made-up one for a new line. */
    key: string;
    id: number | null;
    /** The work lines come first, then the permits: the lines are sent in that order. */
    nature: BoqLineNature;
    code: string;
    description: string;
    quantity: string;
    /** In percent as typed (12.5), sent as a fraction (0.125). */
    waste: string;
    unit: string;
    rate: string;
};

export type Draft = {
    title: string;
    reason: string;
    adjustment: BoqAdjustmentType;
    /** In percent when the adjustment is a percentage (-5 for 5% off), otherwise the new total. */
    adjustmentValue: string;
    lines: LineDraft[];
};

/** A percentage as typed, from a fraction: 0.125 → "12.5". */
export const percentText = (fraction: number) => String(Math.round(fraction * 10000) / 100);

/** A fraction from a percentage as typed: "12.5" → 0.125, exact to the API's four decimals. */
const fractionOf = (percent: number) => Math.round(percent * 100) / 10000;

let made = 0;
export const newLineKey = () => `new-${++made}`;

/** The blank work rows the editor starts with, and adds each time the last one is used. */
export const BLOCK = 10;

/** A permit is one price: one of it, no waste. */
export const blankLine = (nature: BoqLineNature = "work"): LineDraft =>
    ({ key: newLineKey(), id: null, nature, code: "", description: "", quantity: nature === "permit" ? "1" : "", waste: "0", unit: "", rate: "" });

/** Whether anything is typed in the line: a blank one is left out when the BOQ is saved. */
export function lineUsed(l: LineDraft): boolean {
    const typed = [l.code, l.description, l.rate, ...(l.nature === "work" ? [l.quantity, l.unit] : [])].some((v) => v.trim() !== "");
    return typed || (l.nature === "work" && l.waste.trim() !== "" && Number(l.waste) !== 0);
}

/**
 * The lines with blank work rows to type into: at least a block of them, and a block more once every one is used (or
 * when `more` asks for it), as long as the BOQ can take more lines.
 */
export function withBlankLines(lines: LineDraft[], more = false): LineDraft[] {
    const work = lines.filter((l) => l.nature === "work");
    const missing = work.length < BLOCK ? BLOCK - work.length : more || work.every(lineUsed) ? BLOCK : 0;
    const room = Math.max(0, BOQ_MAX_LINES - lines.filter(lineUsed).length);
    const added = Array.from({ length: Math.min(missing, room) }, () => blankLine("work"));
    return added.length ? [...work, ...added, ...lines.filter((l) => l.nature === "permit")] : lines;
}

/** The lines with a new blank one at the end of its part: a work line before the permits, a permit at the very end. */
export function withNewLine(lines: LineDraft[], nature: BoqLineNature): LineDraft[] {
    const at = nature === "work" ? lines.filter((l) => l.nature === "work").length : lines.length;
    return [...lines.slice(0, at), blankLine(nature), ...lines.slice(at)];
}

/** A saved line as it is typed. A permit is one price, so one saved with a quantity becomes one of its total. */
function lineOf(line: BoqLine): LineDraft {
    const draft = {
        key: `line-${line.id}`, id: line.id, nature: line.nature, code: line.code ?? "", description: line.description, quantity: String(line.quantity),
        waste: percentText(line.wasteRate), unit: line.unit ?? "", rate: String(line.rate),
    };
    return line.nature === "permit" && (line.quantity !== 1 || line.wasteRate !== 0) ? { ...draft, quantity: "1", waste: "0", rate: String(line.totalUsd) } : draft;
}

/** The editor's starting point: the BOQ as last saved, its work lines first and then its permits. */
export function draftOf(boq: Boq): Draft {
    const adjustmentValue = boq.adjustmentValue == null ? "" : boq.adjustmentType === "percent" ? percentText(boq.adjustmentValue) : String(boq.adjustmentValue);
    const lines = [...boq.lines.filter((l) => l.nature === "work"), ...boq.lines.filter((l) => l.nature === "permit")].map(lineOf);
    return { title: boq.title, reason: boq.reason ?? "", adjustment: boq.adjustmentType, adjustmentValue, lines };
}

/** A typed number, or NaN when there is none. */
const numberOf = (text: string) => (text.trim() === "" ? NaN : Number(text));

/**
 * What is sent to save: only fractions and numbers, never a figure the API works out, and the save the draft started
 * from, so the API refuses it if someone saved since (boq_changed) rather than undo their changes.
 */
export function requestOf(draft: Draft, kind: BoqKind, startedFrom: string): Schemas["SaveBoqRequest"] {
    const value = numberOf(draft.adjustmentValue);
    return {
        updatedAt: startedFrom,
        title: draft.title.trim(),
        reason: kind === "vo" ? draft.reason.trim() : null,
        adjustmentType: draft.adjustment,
        adjustmentValue: draft.adjustment === "none" ? null : draft.adjustment === "percent" ? fractionOf(value) : value,
        lines: draft.lines.filter(lineUsed).map((l) => ({
            id: l.id,
            nature: l.nature,
            code: l.code.trim() || null,
            description: l.description.trim(),
            quantity: numberOf(l.quantity),
            wasteRate: l.waste.trim() === "" ? 0 : fractionOf(Number(l.waste)),
            unit: l.unit.trim() || null,
            rate: numberOf(l.rate),
        })),
    };
}

/** What makes two drafts the same: the text, trimmed, and the numbers as numbers ("1.50" is 1.5). */
const signature = (draft: Draft) => JSON.stringify([
    draft.title.trim(), draft.reason.trim(), draft.adjustment, draft.adjustment === "none" ? null : numberOf(draft.adjustmentValue),
    draft.lines.filter(lineUsed).map((l) => [l.id, l.nature, l.code.trim(), l.description.trim(), numberOf(l.quantity), numberOf(l.waste || "0"), l.unit.trim(), numberOf(l.rate)]),
]);

/** Whether the draft differs from the saved BOQ, in anything the API would keep: blank rows count for nothing. */
export const isDirty = (draft: Draft, saved: Boq) => signature(draft) !== signature(draftOf(saved));

/*
 * The figures, worked out as the API does: to the cent, half a cent away from zero.
 */

/** A sum of money to the cent, half a cent away from zero, steady against binary fractions (1.005 is 1.01). */
export const toCents = (n: number) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-6)) / 100;

/** A line's final quantity (with its waste) and total (that × its unit cost); null until both numbers are typed. */
export function lineFigures(l: LineDraft): { finalQuantity: number; total: number } | null {
    const quantity = numberOf(l.quantity), rate = numberOf(l.rate);
    const waste = l.waste.trim() === "" ? 0 : fractionOf(Number(l.waste));
    if (!Number.isFinite(quantity) || !Number.isFinite(rate) || !Number.isFinite(waste)) return null;
    const finalQuantity = toCents(quantity * (1 + waste));
    return { finalQuantity, total: toCents(finalQuantity * rate) };
}

export type DraftTotals = { subtotal: number; adjustment: number; total: number; permits: number };

/** The work's subtotal, its adjustment and total, and the permits apart: the adjustment is the work's only. */
export function totalsOf(draft: Draft): DraftTotals {
    const sum = (nature: BoqLineNature) =>
        toCents(draft.lines.filter((l) => l.nature === nature && lineUsed(l)).reduce((all, l) => all + (lineFigures(l)?.total ?? 0), 0));
    const subtotal = sum("work");
    const value = numberOf(draft.adjustmentValue);
    const adjustment = !Number.isFinite(value) ? 0
        : draft.adjustment === "percent" ? toCents(subtotal * fractionOf(value))
            : draft.adjustment === "total" ? toCents(toCents(value) - subtotal) : 0;
    return { subtotal, adjustment, total: toCents(subtotal + adjustment), permits: sum("permit") };
}

/** What the client receives on top of the work: supervision and TVA on the work only, never on the permits. */
export function clientFiguresOf(totals: DraftTotals, supervisionRate: number, tvaRate: number) {
    const supervision = toCents(totals.total * supervisionRate);
    const tva = toCents(totals.total * tvaRate);
    return { supervision, tva, clientTotal: toCents(totals.total + supervision + totals.permits + tva) };
}

/*
 * What is wrong with a draft, as the API would refuse it (BoqRules, SaveBoqRequestValidator): the same limits, so
 * nothing is sent that would only come back refused.
 */

export type LineProblems = Partial<Record<"code" | "description" | "quantity" | "waste" | "unit" | "rate", string>>;
export type DraftProblems = { title?: string; reason?: string; adjustmentValue?: string; lines?: string; line: Record<string, LineProblems> };

const atMost = (n: number) => `At most ${n.toLocaleString("en-US")} characters.`;

function lineProblems(l: LineDraft, kind: BoqKind): LineProblems {
    const p: LineProblems = {};
    const permit = l.nature === "permit";
    if (l.code.trim().length > BOQ_CODE_MAX) p.code = atMost(BOQ_CODE_MAX);
    if (!l.description.trim()) p.description = permit ? "Say which permit it is." : "Describe the work.";
    else if (l.description.trim().length > BOQ_DESCRIPTION_MAX) p.description = atMost(BOQ_DESCRIPTION_MAX);
    if (l.unit.trim().length > BOQ_UNIT_MAX) p.unit = atMost(BOQ_UNIT_MAX);
    const quantity = numberOf(l.quantity);
    if (Number.isNaN(quantity)) p.quantity = "Enter a quantity.";
    else if (quantity < 0) p.quantity = "The quantity can't be negative.";
    const waste = l.waste.trim() === "" ? 0 : Number(l.waste);
    if (Number.isNaN(waste) || waste < 0 || waste > 100) p.waste = "The waste is between 0% and 100%.";
    const rate = numberOf(l.rate);
    if (Number.isNaN(rate)) p.rate = permit ? "Enter the price." : "Enter a unit cost.";
    else if (rate < 0 && kind !== "vo") p.rate = permit ? "Only a VO can have a negative price." : "Only a VO can have a negative unit cost.";
    return p;
}

export function problemsOf(draft: Draft, kind: BoqKind): DraftProblems {
    const problems: DraftProblems = { line: {} };
    if (!draft.title.trim()) problems.title = "Give it a title.";
    else if (draft.title.trim().length > BOQ_TITLE_MAX) problems.title = atMost(BOQ_TITLE_MAX);
    if (kind === "vo") {
        if (!draft.reason.trim()) problems.reason = "Say why the variation is needed.";
        else if (draft.reason.trim().length > BOQ_REASON_MAX) problems.reason = atMost(BOQ_REASON_MAX);
    }
    if (draft.adjustment !== "none") {
        const value = numberOf(draft.adjustmentValue);
        if (Number.isNaN(value)) problems.adjustmentValue = draft.adjustment === "percent" ? "Enter the percentage." : "Enter the new total.";
        else if (draft.adjustment === "percent" && (value < -99 || value > 100)) problems.adjustmentValue = "The adjustment is between -99% and 100%.";
        else if (draft.adjustment === "total" && value < 0 && kind !== "vo") problems.adjustmentValue = "The new total can't be negative.";
    }
    const used = draft.lines.filter(lineUsed);
    if (used.length > BOQ_MAX_LINES) problems.lines = `At most ${BOQ_MAX_LINES.toLocaleString("en-US")} lines.`;
    for (const l of used) {
        const p = lineProblems(l, kind);
        if (Object.keys(p).length) problems.line[l.key] = p;
    }
    return problems;
}

/** The cells a line's server error names (lines[2].wasteRate) in the table's own words. */
const CELL: Record<string, keyof LineProblems> = { code: "code", description: "description", quantity: "quantity", wasteRate: "waste", unit: "unit", rate: "rate" };

/**
 * What the API refused, placed beside what it was about: a line's field error (lines[2].description) goes on the
 * third line as it was sent (the blank rows are never sent), and an error about the lines as a whole under them. What
 * the form found itself comes first.
 */
export function withServerProblems(problems: DraftProblems, draft: Draft, fields: Record<string, string>): DraftProblems {
    const line = { ...problems.line };
    const sent = draft.lines.filter(lineUsed);
    for (const [key, message] of Object.entries(fields)) {
        const named = /^lines\[(\d+)\]\.(\w+)$/.exec(key);
        const target = named && sent[Number(named[1])];
        const cell = named && CELL[named[2]];
        if (target && cell) line[target.key] = { ...line[target.key], [cell]: line[target.key]?.[cell] ?? message };
    }
    return { ...problems, lines: problems.lines ?? fields.lines, line };
}

/** Whether anything is wrong with the draft. */
export const hasProblems = (p: DraftProblems) => !!(p.title || p.reason || p.adjustmentValue || p.lines || Object.keys(p.line).length);

/**
 * A number as it is typed into a BOQ field, kept to its shape and, where a minus is allowed, to one leading sign:
 * null when the last key would refuse it.
 */
export function fitSigned(raw: string, shape: NumberShape, before: string, negative: boolean): string | null {
    const minus = negative && raw.trimStart().startsWith("-") ? "-" : "";
    const fitted = fitNumber(raw.replace(/-/g, ""), shape, before.replace("-", ""));
    return fitted == null ? null : minus + fitted;
}
