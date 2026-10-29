import type { Schemas } from "@/api/types";
import { fitNumber, type NumberShape } from "@/shared/format/limits";
import {
    BOQ_CODE_MAX, BOQ_DESCRIPTION_MAX, BOQ_MAX_LINES, BOQ_REASON_MAX, BOQ_TITLE_MAX, BOQ_UNIT_MAX,
    type Boq, type BoqAdjustmentType, type BoqKind, type BoqLine,
} from "./boqsApi";

/*
 * A BOQ as it is being typed in. Everything is text until it is sent; every figure that comes out of the
 * numbers (final quantity, line total, subtotal, adjustment, total, supervision, TVA) is worked out by the API
 * and only ever shown from the last saved BOQ: nothing here adds or multiplies money.
 */

export type LineDraft = {
    /** Stable while it is edited: the saved line's id, or a made-up one for a new line. */
    key: string;
    id: number | null;
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

export const blankLine = (): LineDraft => ({ key: newLineKey(), id: null, code: "", description: "", quantity: "", waste: "0", unit: "", rate: "" });

const lineOf = (line: BoqLine): LineDraft => ({
    key: `line-${line.id}`, id: line.id, code: line.code ?? "", description: line.description, quantity: String(line.quantity),
    waste: percentText(line.wasteRate), unit: line.unit ?? "", rate: String(line.rate),
});

/** The editor's starting point: the BOQ as last saved. */
export function draftOf(boq: Boq): Draft {
    const adjustmentValue = boq.adjustmentValue == null ? "" : boq.adjustmentType === "percent" ? percentText(boq.adjustmentValue) : String(boq.adjustmentValue);
    return { title: boq.title, reason: boq.reason ?? "", adjustment: boq.adjustmentType, adjustmentValue, lines: boq.lines.map(lineOf) };
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
        lines: draft.lines.map((l) => ({
            id: l.id,
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
    draft.lines.map((l) => [l.id, l.code.trim(), l.description.trim(), numberOf(l.quantity), numberOf(l.waste || "0"), l.unit.trim(), numberOf(l.rate)]),
]);

/** Whether the draft differs from the saved BOQ, in anything the API would keep. */
export const isDirty = (draft: Draft, saved: Boq) => signature(draft) !== signature(draftOf(saved));

/**
 * Whether a line differs from its saved self (a line never saved always does): its computed cells are the last
 * save's, so until it is saved they say nothing about what it is now.
 */
export function lineChanged(line: LineDraft, saved: BoqLine | undefined): boolean {
    if (!saved) return true;
    const now = lineOf(saved);
    const same = (a: string, b: string) => a.trim() === b.trim();
    return !(same(line.code, now.code) && same(line.description, now.description) && same(line.unit, now.unit)
        && numberOf(line.quantity) === numberOf(now.quantity) && numberOf(line.waste || "0") === numberOf(now.waste) && numberOf(line.rate) === numberOf(now.rate));
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
    if (l.code.trim().length > BOQ_CODE_MAX) p.code = atMost(BOQ_CODE_MAX);
    if (!l.description.trim()) p.description = "Describe the work.";
    else if (l.description.trim().length > BOQ_DESCRIPTION_MAX) p.description = atMost(BOQ_DESCRIPTION_MAX);
    if (l.unit.trim().length > BOQ_UNIT_MAX) p.unit = atMost(BOQ_UNIT_MAX);
    const quantity = numberOf(l.quantity);
    if (Number.isNaN(quantity)) p.quantity = "Enter a quantity.";
    else if (quantity < 0) p.quantity = "The quantity can't be negative.";
    const waste = l.waste.trim() === "" ? 0 : Number(l.waste);
    if (Number.isNaN(waste) || waste < 0 || waste > 100) p.waste = "The waste is between 0% and 100%.";
    const rate = numberOf(l.rate);
    if (Number.isNaN(rate)) p.rate = "Enter a rate.";
    else if (rate < 0 && kind !== "vo") p.rate = "Only a VO can have a negative rate.";
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
    if (draft.lines.length > BOQ_MAX_LINES) problems.lines = `At most ${BOQ_MAX_LINES.toLocaleString("en-US")} lines.`;
    for (const l of draft.lines) {
        const p = lineProblems(l, kind);
        if (Object.keys(p).length) problems.line[l.key] = p;
    }
    return problems;
}

/** The cells a line's server error names (lines[2].wasteRate) in the table's own words. */
const CELL: Record<string, keyof LineProblems> = { code: "code", description: "description", quantity: "quantity", wasteRate: "waste", unit: "unit", rate: "rate" };

/**
 * What the API refused, placed beside what it was about: a line's field error (lines[2].description) goes on the
 * third line as it was sent, and an error about the lines as a whole under them. What the form found itself comes first.
 */
export function withServerProblems(problems: DraftProblems, draft: Draft, fields: Record<string, string>): DraftProblems {
    const line = { ...problems.line };
    for (const [key, message] of Object.entries(fields)) {
        const named = /^lines\[(\d+)\]\.(\w+)$/.exec(key);
        const target = named && draft.lines[Number(named[1])];
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
