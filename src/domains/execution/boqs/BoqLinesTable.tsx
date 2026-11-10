import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FieldError } from "@/shared/components/Forms/Field";
import { BOQ_NUMBER, BOQ_PERCENT, type NumberShape } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import type { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { BOQ_CODES, type BoqCode } from "./boqCodes";
import { fitSigned, lineFigures, lineUsed, type DraftProblems, type LineDraft } from "./boqDraft";
import { changeValue } from "./boqRules";
import type { BoqLineChange, BoqLineNature } from "./boqsApi";

type Field = "code" | "description" | "quantity" | "waste" | "unit" | "rate";
type Dir = "next" | "prev" | "up" | "down" | "left" | "right";
/** A cell typed in, or one the line's numbers work out. */
type Col = { field: Field; label: string; w: string; shape?: NumberShape } | { figure: "finalQuantity" | "total"; label: string; w: string };

const WORK: Col[] = [
    { field: "code", label: "Code", w: "9%" },
    { field: "description", label: "Description", w: "27%" },
    { field: "quantity", label: "Quantity", w: "9%", shape: BOQ_NUMBER },
    { field: "waste", label: "Waste %", w: "8%", shape: BOQ_PERCENT },
    { figure: "finalQuantity", label: "Final quantity", w: "9%" },
    { field: "unit", label: "Unit", w: "7%" },
    { field: "rate", label: "Unit cost", w: "10%", shape: BOQ_NUMBER },
    { figure: "total", label: "Total", w: "11%" },
];
/** A permit is one price: no quantity, waste or unit to type. */
const PERMIT: Col[] = [
    { field: "code", label: "Code", w: "12%" },
    { field: "description", label: "Description", w: "58%" },
    { field: "rate", label: "Price", w: "16%", shape: BOQ_NUMBER },
];

/** Where a figure stands while the line's numbers aren't all typed. */
const NONE = "—";
const quantityText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type Props = {
    /** The table's name: "Lines" for the work, "Permits" for the permits. */
    label: string;
    nature: BoqLineNature;
    /** One part of the BOQ's lines: its work (with its blank rows), or its permits. */
    lines: LineDraft[];
    /** How many of the BOQ's lines come before this part: its lines are moved and removed by their place in all of them. */
    first: number;
    readOnly: boolean;
    problems: DraftProblems;
    errors: ReturnType<typeof useFormErrors>;
    onChange: (key: string, patch: Partial<LineDraft>) => void;
    onMove: (index: number, by: -1 | 1) => void;
    onRemove: (index: number) => void;
    /** Ten more blank rows, when Enter is pressed on the last cell of the last one. */
    onGrow?: () => void;
    /** What others changed in a submitted draft since it was submitted, by line: shown on the lines, never worked out here. */
    changes?: ReadonlyMap<number, BoqLineChange>;
};

function focusCell(root: HTMLElement | null, r: number, c: number) {
    const el = root?.querySelector<HTMLInputElement>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el || el.disabled) return;
    el.focus();
    el.select();
}

/**
 * One part of a BOQ's lines, its work or its permits, typed like the expenses sheet: Enter goes to the next cell and
 * on to the next row (ten more rows once the last is reached), Shift+Enter back, the arrows between cells. The final
 * quantity and total of each line are worked out as it is typed. Errors show under the line, as it is left or once a
 * save was tried. A line moves within its part.
 */
export default function BoqLinesTable({ label, nature, lines, first, readOnly, problems, errors, onChange, onMove, onRemove, onGrow, changes }: Props) {
    const ref = useRef<HTMLTableElement>(null);
    const cols = nature === "permit" ? PERMIT : WORK;
    const inputs = cols.filter((c): c is Extract<Col, { field: Field }> => "field" in c);
    // a BOQ that can't be changed shows only its lines, never the blank rows
    const rows = readOnly ? lines.filter(lineUsed) : lines;
    const used = rows.filter(lineUsed).length;
    const name = nature === "permit" ? "permit" : "line";

    function nav(r: number, c: number, dir: Dir) {
        const last = inputs.length - 1;
        let R = r, C = c;
        if (dir === "next") { if (C < last) C++; else { C = 0; R++; } }
        else if (dir === "prev") { if (C > 0) C--; else if (R > 0) { C = last; R--; } else return; }
        else if (dir === "down") R++;
        else if (dir === "up") { if (R === 0) return; R--; }
        else if (dir === "right") { if (C < last) C++; else return; }
        else if (C > 0) C--;
        else return;
        if (R >= rows.length) {
            if (!onGrow || dir === "up") return;
            onGrow();
            setTimeout(() => focusCell(ref.current, R, C), 0);
            return;
        }
        focusCell(ref.current, R, C);
    }

    function figure(l: LineDraft, which: "finalQuantity" | "total") {
        const f = lineUsed(l) ? lineFigures(l) : null;
        if (!f) return NONE;
        return which === "finalQuantity" ? quantityText(f.finalQuantity) : money.exact(f.total, "USD", { cents: true });
    }

    function cell(l: LineDraft, r: number, n: number, col: Extract<Col, { field: Field }>, c: number) {
        const text = l[col.field];
        // the value it had when the draft was submitted, when others have changed it since
        const before = l.id == null ? undefined : changes?.get(l.id)?.fields.find((f) => f.field === (col.field === "waste" ? "wasteRate" : col.field));
        const was = before ? <del className="boq-was" title={`Was ${changeValue(before.field, before.before)}`}>{changeValue(before.field, before.before)}</del> : null;
        const bad = errors.show(`${l.key}:${col.field}`, problems.line[l.key]?.[col.field]);
        const numeric = col.shape != null;
        const aria = nature === "permit" && col.field !== "rate" ? `Permit ${col.label.toLowerCase()} ${n}` : `${col.label} ${n}`;
        const shared = {
            r, c, aria, bad, readOnly, onLeave: errors.touch(`${l.key}:${col.field}`), onNav: (dir: Dir) => nav(r, c, dir),
        };
        if (col.field === "code") {
            return (
                <CodeCell key={col.field} {...shared} value={text} was={was}
                    onChange={(v) => onChange(l.key, { code: v })}
                    onPick={(code) => onChange(l.key, {
                        code: code.code,
                        // the work the code names, where nothing is typed yet
                        ...(l.description.trim() ? {} : { description: code.description }),
                        ...(nature === "work" && !l.unit.trim() && code.unit ? { unit: code.unit } : {}),
                    })} />
            );
        }
        return (
            <td key={col.field} className={cx("sh-cell", numeric && "r", bad && "bad", before && "boq-changed")}>
                {was}
                <input className={cx("sh-in", numeric && "mono")} data-r={r} data-c={c} aria-label={aria} aria-invalid={bad ? true : undefined}
                    value={text} disabled={readOnly} autoComplete="off" spellCheck={false} inputMode={numeric ? "decimal" : undefined}
                    onBlur={shared.onLeave}
                    onKeyDown={(e) => keyNav(e, shared.onNav)}
                    onChange={(e) => {
                        // a minus is typed and then refused with a reason (only a VO's unit cost may be negative), not dropped
                        const next = col.shape ? fitSigned(e.target.value, col.shape, text, col.field !== "waste") : e.target.value;
                        if (next != null) onChange(l.key, { [col.field]: next });
                    }} />
            </td>
        );
    }

    return (
        <div className="sh-wrap">
            <table className="sh" aria-label={label} ref={ref}>
                <colgroup>
                    <col style={{ width: 36 }} />
                    {cols.map((c) => <col key={c.label} style={{ width: c.w }} />)}
                    {!readOnly && <col style={{ width: 92 }} />}
                </colgroup>
                <thead>
                    <tr>
                        <th className="sh-n">#</th>
                        {cols.map((c) => <th key={c.label} className={"figure" in c || c.shape ? "r" : undefined}>{c.label}</th>)}
                        {!readOnly && <th />}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((l, r) => {
                        const n = r + 1;
                        const blank = !lineUsed(l);
                        const said = (Object.keys(problems.line[l.key] ?? {}) as Field[])
                            .map((f) => errors.show(`${l.key}:${f}`, problems.line[l.key]?.[f])).filter((m): m is string => !!m);
                        const change = l.id == null ? undefined : changes?.get(l.id);
                        const moved = change?.fields.find((f) => f.field === "nature");
                        const note = change?.kind === "added" ? `${name} ${n} since you submitted it`
                            : moved ? `${name} ${n}: was ${changeValue("nature", moved.before).toLowerCase()}, now ${changeValue("nature", moved.after).toLowerCase()}` : null;
                        return (
                            <Fragment key={l.key}>
                                <tr className={cx("sh-row", blank && "sh-blank", change?.kind === "added" && "boq-added")}>
                                    <td className="sh-n">{n}</td>
                                    {cols.map((col) => ("figure" in col
                                        ? <td key={col.figure} className="r mono sh-total">{figure(l, col.figure)}</td>
                                        : cell(l, r, n, col, inputs.indexOf(col))))}
                                    {!readOnly && (
                                        <td className="sh-act">
                                            {!blank && (
                                                <>
                                                    <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Move ${name} ${n} up`} disabled={r === 0} onClick={() => onMove(first + r, -1)}><Icon name="arrowUp" /></button>
                                                    <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Move ${name} ${n} down`} disabled={r >= used - 1} onClick={() => onMove(first + r, 1)}><Icon name="arrowDown" /></button>
                                                    <button type="button" className="sh-del" aria-label={`Remove ${name} ${n}`} title="Remove" onClick={() => onRemove(first + r)}><Icon name="trash" /></button>
                                                </>
                                            )}
                                        </td>
                                    )}
                                </tr>
                                {note && (
                                    <tr className="boq-line-note">
                                        <td colSpan={cols.length + (readOnly ? 1 : 2)}>
                                            <span className={cx("badge", change?.kind === "added" && "badge-active")}>{change?.kind === "added" ? "Added" : "Moved"}</span>
                                            <span className="muted"> {note}</span>
                                        </td>
                                    </tr>
                                )}
                                {said.length > 0 && (
                                    <tr className="boq-line-err">
                                        <td colSpan={cols.length + (readOnly ? 1 : 2)} style={{ padding: "4px 12px", height: "auto" }}>
                                            {said.map((m) => <FieldError key={m} message={`${nature === "permit" ? "Permit" : "Line"} ${n}: ${m}`} />)}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Enter, the arrows and Shift+Enter move between cells; ← → only once the caret is at the edge of the text. */
function keyNav(e: KeyboardEvent<HTMLInputElement>, onNav: (dir: Dir) => void) {
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); onNav(e.shiftKey ? "prev" : "next"); }
    else if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); onNav(k === "ArrowDown" ? "down" : "up"); }
    else if ((k === "ArrowRight" || k === "ArrowLeft") && !e.shiftKey) {
        const el = e.currentTarget, len = el.value.length, a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
        const whole = a === 0 && b === len;
        if (k === "ArrowRight" ? whole || a === len : whole || b === 0) {
            e.preventDefault();
            onNav(k === "ArrowRight" ? "right" : "left");
        }
    }
}

/** The codes offered for what is typed: those starting with it, or whose work it names. */
function codesFor(text: string): BoqCode[] {
    const t = text.trim().toLowerCase();
    return t ? BOQ_CODES.filter((c) => c.code.toLowerCase().startsWith(t) || c.description.toLowerCase().includes(t)) : BOQ_CODES;
}

type CodeCellProps = {
    /** The value it had when the draft was submitted, struck through above the new one. */
    was?: ReactNode;
    r: number;
    c: number;
    aria: string;
    value: string;
    bad?: string;
    readOnly: boolean;
    onChange: (value: string) => void;
    onPick: (code: BoqCode) => void;
    onLeave: () => void;
    onNav: (dir: Dir) => void;
};

/**
 * A code, typed freely, with the codes already in use offered under the cell (BOQ_CODES): ↑ ↓ move through them,
 * Enter takes the one chosen and goes on to the next cell, Esc closes the list. Picking one also fills in the work
 * it names and its unit, where nothing is typed yet. Without a choice made with the arrows, Enter keeps what was typed.
 */
function CodeCell({ r, c, aria, value, was, bad, readOnly, onChange, onPick, onLeave, onNav }: CodeCellProps) {
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    // a code chosen with the arrows; until then Enter keeps what was typed
    const [moved, setMoved] = useState(false);
    // typed in since it was focused: until then every code is offered, the cell's own among them
    const [typed, setTyped] = useState(false);
    const list = useRef<HTMLDivElement>(null);
    const options = !open ? [] : typed ? codesFor(value) : BOQ_CODES;

    // the chosen code stays in view as the arrows move through a long list
    useEffect(() => {
        list.current?.querySelector<HTMLElement>(".sh-opt.on")?.scrollIntoView?.({ block: "nearest" });
    }, [hi, open]);

    function pick(code: BoqCode) {
        setOpen(false);
        setMoved(false);
        onPick(code);
    }
    function onKey(e: KeyboardEvent<HTMLInputElement>) {
        const k = e.key;
        if (open && options.length > 0 && (k === "ArrowDown" || k === "ArrowUp")) {
            e.preventDefault();
            setMoved(true);
            setHi((at) => Math.max(0, Math.min(options.length - 1, moved ? at + (k === "ArrowDown" ? 1 : -1) : at)));
            return;
        }
        if (k === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
        if (k === "Enter" && open && moved && options[hi]) {
            e.preventDefault();
            pick(options[hi]);
            onNav(e.shiftKey ? "prev" : "next");
            return;
        }
        if (k === "Enter" || k === "Tab") setOpen(false);
        keyNav(e, onNav);
    }

    return (
        <td className={cx("sh-cell", bad && "bad", !!was && "boq-changed", open && options.length > 0 && "open")}>
            {was}
            <input className="sh-in" data-r={r} data-c={c} aria-label={aria} aria-invalid={bad ? true : undefined}
                role="combobox" aria-expanded={open && options.length > 0} aria-autocomplete="list"
                value={value} disabled={readOnly} autoComplete="off" spellCheck={false}
                onFocus={() => {
                    const at = BOQ_CODES.findIndex((code) => code.code === value.trim());
                    setHi(Math.max(0, at));
                    setMoved(false);
                    setTyped(false);
                    setOpen(true);
                }}
                onBlur={() => { setOpen(false); onLeave(); }}
                onKeyDown={onKey}
                onChange={(e) => { onChange(e.target.value); setOpen(true); setTyped(true); setHi(0); setMoved(false); }} />
            {open && options.length > 0 && (
                <div className="sh-opts boq-codes" role="listbox" aria-label={`Codes for ${aria}`} ref={list}>
                    {options.map((code, i) => (
                        <div key={`${code.code}:${code.description}`} role="option" aria-selected={moved && i === hi} className={cx("sh-opt", moved && i === hi && "on")}
                            onMouseDown={(e) => { e.preventDefault(); pick(code); onNav("next"); }}>
                            <b>{code.code}</b><span>{code.description}</span>
                        </div>
                    ))}
                </div>
            )}
        </td>
    );
}
