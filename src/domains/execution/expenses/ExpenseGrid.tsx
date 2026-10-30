import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { FieldError } from "@/shared/components/Forms/Field";
import { groupedNumber } from "@/shared/components/Forms/groupedNumber";
import { fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { COLS, isDay, resolveDay, resolveUnit, rowUsed, UNITS, type Choice, type Col, type ColKey, type Row, type RowProblems } from "./expenseRules";

type Dir = "next" | "prev" | "up" | "down" | "left" | "right";
export type GridRow = Row & { id?: number; by?: string; cls?: string; title?: string };

type CellProps = {
    col: Col;
    /** The row's number as shown, for the cell's name ("Item 3"). */
    n: number;
    r: number;
    c: number;
    value: string;
    readOnly: boolean;
    /** What is wrong with the cell, once that is to be shown. */
    bad?: string;
    dash?: boolean;
    /** A draft sheet hands every keystroke up; a saved grid only what is left in the cell. */
    eager?: boolean;
    /** What a cell picked from a list can be. */
    options?: Choice[];
    onCommit: (value: string, typing?: boolean) => void;
    /** The cell was left: its error shows from then on. */
    onLeave: () => void;
    onNav: (dir: Dir) => void;
    onPaste?: (text: string) => void;
};

/**
 * One cell: its own text while it is typed in, handed up on Enter, Tab or leaving it. The unit is typed too,
 * with a short list under the cell, and the first match is taken; so is a day, read the way people write it
 * (23/9/2026, Sep 23). A currency, category or label is picked from a list.
 */
function Cell({ col, n, r, c, value, readOnly, bad, dash, eager, options, onCommit, onLeave, onNav, onPaste }: CellProps) {
    const combo = col.type === "combo";
    const date = col.type === "date";
    // a day is shown the way the rest of the app writes dates; text that isn't a day as it was typed
    const written = date && isDay(value) ? fmtDateY(value) : value;
    const [text, setText] = useState(written);
    // typed in since it was focused: until then the cell shows what is saved, even as that changes under it
    const [dirty, setDirty] = useState(false);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const editing = useRef(false);
    const moved = useRef(false); // an option was picked with ↑ ↓
    const tq = text.trim().toLowerCase();
    // the unit the cell holds, when it is one from the list
    const saved = UNITS.includes(value) ? value : null;
    // the whole list while the cell still shows what was saved; narrowed as soon as it's typed in
    const opts = !combo ? [] : !tq || tq === saved ? UNITS : UNITS.filter((u) => u.includes(tq));

    function valueOf(t: string): string {
        if (combo) {
            if (moved.current && open && opts[hi]) return opts[hi];
            if (!t.trim()) return "";
            if (saved && t.trim().toLowerCase() === saved) return saved;
            return open && opts[hi] ? opts[hi] : resolveUnit(t);
        }
        if (date) return resolveDay(t);
        return col.type === "num" ? t.replace(/[^0-9.]/g, "") : t;
    }
    function change(t: string) {
        setText(t);
        setDirty(true);
        setHi(0);
        moved.current = false;
        if (combo) setOpen(true);
        if (eager) onCommit(combo ? t : valueOf(t), true);
    }
    // a money cell shows its commas while it is typed in; what is kept and handed up has none
    const shown = dirty ? text : written;
    const amount = col.money ? groupedNumber(shown, null) : null;
    function commit(t: string) {
        editing.current = false;
        setDirty(false);
        setOpen(false);
        onLeave();
        if (dirty || moved.current) onCommit(valueOf(t));
    }
    function onKey(e: KeyboardEvent<HTMLInputElement>) {
        const k = e.key;
        if (combo && open && (k === "ArrowDown" || k === "ArrowUp")) {
            e.preventDefault();
            moved.current = true;
            setHi(Math.max(0, Math.min(opts.length - 1, hi + (k === "ArrowDown" ? 1 : -1))));
            return;
        }
        if (k === "Enter") { e.preventDefault(); commit(text); onNav(e.shiftKey ? "prev" : "next"); }
        else if (k === "Tab") commit(text);
        else if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); commit(text); onNav(k === "ArrowDown" ? "down" : "up"); }
        else if ((k === "ArrowRight" || k === "ArrowLeft") && !e.shiftKey) {
            // ← → leave the cell once the caret is at the edge of the text, or all of it is selected
            const el = e.currentTarget, len = el.value.length, a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
            const whole = a === 0 && b === len;
            if (k === "ArrowRight" ? whole || a === len : whole || b === 0) {
                e.preventDefault();
                commit(text);
                onNav(k === "ArrowRight" ? "right" : "left");
            }
        } else if (k === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    }

    if (col.type === "choice") return <ChoiceCell col={col} n={n} r={r} c={c} value={value} readOnly={readOnly} bad={bad} options={options} onCommit={onCommit} onLeave={onLeave} onNav={onNav} />;

    return (
        <td className={cx("sh-cell", col.type === "num" && "r", bad && "bad", open && "open")} title={bad}>
            <input className={cx("sh-in", col.type !== "text" && "mono")} data-r={r} data-c={c} value={amount ? amount.value : shown}
                aria-label={`${col.label} ${n}`} aria-invalid={bad ? true : undefined} placeholder={dash && col.dash ? "-" : ""}
                inputMode={col.type === "num" ? "decimal" : undefined}
                autoComplete="off" spellCheck={false} style={col.strong ? { fontWeight: 600 } : undefined} disabled={readOnly}
                onFocus={() => {
                    editing.current = true;
                    moved.current = false;
                    setDirty(false);
                    setText(written);
                    if (combo) { setOpen(true); setHi(Math.max(0, UNITS.indexOf(value))); }
                }}
                onBlur={() => { if (editing.current) commit(text); }}
                onChange={(e) => change(amount ? amount.next(e) ?? "" : e.target.value)}
                onKeyDown={(e) => { amount?.onKeyDown(e); onKey(e); }}
                onPaste={onPaste ? (e) => {
                    const t = e.clipboardData.getData("text");
                    if (/[\t\n]/.test(t)) { e.preventDefault(); editing.current = false; setDirty(false); onPaste(t); }
                } : undefined} />
            {combo && open && opts.length > 0 && (
                <div className="sh-opts" role="listbox">
                    {opts.slice(0, 8).map((o, i) => (
                        <div key={o} role="option" aria-selected={i === hi} className={cx("sh-opt", i === hi && "on")}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editing.current = false;
                                setDirty(false);
                                setOpen(false);
                                onCommit(o);
                                onNav("next");
                            }}>{o}</div>
                    ))}
                </div>
            )}
        </td>
    );
}

/**
 * A cell picked from a list (currency, category, label), drawn like the unit's list rather than the browser's own:
 * ↑ ↓ open it and move, a letter jumps to the first choice starting with it, Enter takes it and moves on, Esc closes.
 */
function ChoiceCell({ col, n, r, c, value, readOnly, bad, options, onCommit, onLeave, onNav }: Omit<CellProps, "dash" | "eager" | "onPaste">) {
    const list = options ?? [];
    // a value the list no longer offers is still shown, so the cell never says something else
    const all = !value || list.some((o) => o.value === value) ? list : [{ value, label: value }, ...list];
    const current = all.find((o) => o.value === value);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);

    function show() {
        setHi(Math.max(0, all.findIndex((o) => o.value === value)));
        setOpen(true);
    }
    function pick(i: number) {
        setOpen(false);
        const o = all[i];
        if (o && o.value !== value) onCommit(o.value);
    }
    function onKey(e: KeyboardEvent<HTMLButtonElement>) {
        const k = e.key;
        if (k === "ArrowDown" || k === "ArrowUp") {
            e.preventDefault();
            if (!open) show();
            else setHi(Math.max(0, Math.min(all.length - 1, hi + (k === "ArrowDown" ? 1 : -1))));
        } else if (k === "Enter") {
            e.preventDefault();
            if (open) pick(hi);
            onNav(e.shiftKey ? "prev" : "next");
        } else if (k === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
        } else if (k === "Tab") setOpen(false);
        else if ((k === "ArrowRight" || k === "ArrowLeft") && !open) {
            e.preventDefault();
            onNav(k === "ArrowRight" ? "right" : "left");
        } else if (k.length === 1 && /\S/.test(k)) {
            const from = open ? hi + 1 : 0;
            const order = [...all.slice(from), ...all.slice(0, from)];
            const found = order.find((o) => o.label.toLowerCase().startsWith(k.toLowerCase()));
            if (found) { setHi(all.indexOf(found)); setOpen(true); }
        }
    }

    return (
        <td className={cx("sh-cell", bad && "bad", open && "open")} title={bad}>
            <button type="button" className="sh-in sh-choice" data-r={r} data-c={c} aria-label={`${col.label} ${n}`} aria-invalid={bad ? true : undefined}
                aria-haspopup="listbox" aria-expanded={open} disabled={readOnly}
                onClick={() => (open ? setOpen(false) : show())}
                onBlur={() => { setOpen(false); onLeave(); }}
                onKeyDown={onKey}>
                <span className="trunc">{current?.label ?? ""}</span>
                {!readOnly && <Icon name="chevronDown" />}
            </button>
            {open && all.length > 0 && (
                <div className="sh-opts" role="listbox">
                    {all.map((o, i) => (
                        <div key={o.value} role="option" aria-selected={o.value === value} className={cx("sh-opt", i === hi && "on")}
                            onMouseDown={(e) => { e.preventDefault(); pick(i); onNav("next"); }}>{o.label}</div>
                    ))}
                </div>
            )}
        </td>
    );
}

/** Two clicks to delete: the first arms it for a few seconds. */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 2500);
        return () => clearTimeout(t);
    }, [armed]);
    return armed
        ? <button type="button" className="sh-del armed" onClick={onDelete} title="Click again to delete">Delete?</button>
        : <button type="button" className="sh-del" aria-label="Delete row" title="Delete" onClick={() => setArmed(true)}><Icon name="trash" /></button>;
}

function focusCell(root: HTMLElement | null, r: number, c: number): boolean {
    const el = root?.querySelector<HTMLInputElement | HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el || el.disabled) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
}

/** The narrowest a column can be dragged to, as a share of the table. */
const MIN_COL = 3;
const WIDTHS_KEY = "expense-grid-widths";

/** Each column's width as a share of the table, as last dragged in this browser (kept per set of columns). */
function savedWidths(cols: Col[]): number[] {
    const fallback = cols.map((c) => parseFloat(c.w));
    try {
        const saved = JSON.parse(localStorage.getItem(`${WIDTHS_KEY}:${cols.map((c) => c.k).join(",")}`) ?? "null");
        return Array.isArray(saved) && saved.length === cols.length && saved.every((n) => typeof n === "number") ? saved : fallback;
    } catch {
        return fallback;
    }
}

function saveWidths(cols: Col[], widths: number[] | null) {
    try {
        const key = `${WIDTHS_KEY}:${cols.map((c) => c.k).join(",")}`;
        if (widths) localStorage.setItem(key, JSON.stringify(widths));
        else localStorage.removeItem(key);
    } catch {
        // storage blocked: the widths last until the page is left
    }
}

type GridProps = {
    rows: GridRow[];
    cols?: Col[];
    /** The number of the first row, when the grid shows a page of a longer list. */
    offset?: number;
    showBy?: boolean;
    /** "-" in the optional cells left empty. */
    dash?: boolean;
    eager?: boolean;
    /** Whether a cell may be changed, and whether a row may be deleted. */
    locked?: (r: number, k: ColKey) => boolean;
    canDelete?: (r: number) => boolean;
    /**
     * Columns can be widened by dragging their right edge: the column after gives up the same width, so the table
     * never grows. A double click on an edge puts every column back.
     */
    resizable?: boolean;
    /** What is wrong with each row: a cell shows it, with the message under its row, once it was left or when `tried`. */
    problems?: RowProblems[] | null;
    tried?: boolean;
    /** The options of a cell picked from a list. */
    choices?: (r: number, k: ColKey) => Choice[];
    /** The narrowest the table may get before it scrolls inside its panel. */
    minWidth?: number;
    onCell: (r: number, k: ColKey, value: string, typing?: boolean) => void;
    onGrow?: () => void;
    onPaste?: (r: number, c: number, text: string) => void;
    onDelete?: (r: number) => void;
    foot?: ReactNode;
};

/**
 * Expenses in rows, as site staff keep them (the prototype's sheet): Enter goes to the next cell and on to
 * the next row, Shift+Enter back, the arrows between cells. The grid knows nothing about saving.
 */
export default function ExpenseGrid({ rows, cols = COLS, offset = 0, showBy, dash, eager, locked, canDelete, resizable, problems, tried, choices, minWidth, onCell, onGrow, onPaste, onDelete, foot }: GridProps) {
    const ref = useRef<HTMLDivElement>(null);
    const table = useRef<HTMLTableElement>(null);
    const [widths, setWidths] = useState(() => (resizable ? savedWidths(cols) : cols.map((c) => parseFloat(c.w))));
    const [dragging, setDragging] = useState<number | null>(null);

    /** Drags the edge between column i and i + 1: what one gains the other gives up. */
    function startResize(i: number, e: ReactPointerEvent<HTMLSpanElement>) {
        if (e.button !== 0 || !table.current) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture?.(e.pointerId);
        const startX = e.clientX, start = widths, pair = start[i] + start[i + 1];
        const perPx = 100 / table.current.offsetWidth;
        setDragging(i);
        let latest = start;
        const move = (ev: PointerEvent) => {
            const a = Math.min(Math.max(start[i] + (ev.clientX - startX) * perPx, MIN_COL), pair - MIN_COL);
            latest = start.map((w, k) => (k === i ? a : k === i + 1 ? pair - a : w));
            setWidths(latest);
        };
        const end = () => {
            handle.removeEventListener("pointermove", move);
            setDragging(null);
            saveWidths(cols, latest);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end, { once: true });
        handle.addEventListener("pointercancel", end, { once: true });
    }
    function resetWidths() {
        setWidths(cols.map((c) => parseFloat(c.w)));
        saveWidths(cols, null);
    }
    // the cells that were left, by row and column: their errors show from then on
    const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
    const leave = (row: GridRow, k: ColKey) => setLeft((seen) => (seen.has(`${row.key}:${k}`) ? seen : new Set(seen).add(`${row.key}:${k}`)));
    function nav(r: number, c: number, dir: Dir) {
        let R = r, C = c;
        const last = cols.length - 1;
        if (dir === "next") { if (C < last) C++; else { C = 0; R++; } }
        else if (dir === "prev") { if (C > 0) C--; else if (R > 0) { C = last; R--; } }
        else if (dir === "down") R++;
        else if (dir === "up") R = Math.max(0, R - 1);
        else if (dir === "right") { if (C < last) C++; else return; }
        else if (C > 0) C--;
        else return;
        if (R >= rows.length) {
            if (!onGrow) return;
            onGrow();
            setTimeout(() => focusCell(ref.current, R, C), 0);
            return;
        }
        if (!focusCell(ref.current, R, C) && dir === "next") focusCell(ref.current, R + 1, 0);
    }

    return (
        <div className="sh-wrap" ref={ref}>
            <table className={cx("sh", dragging != null && "sh-resizing")} ref={table} style={minWidth ? { minWidth } : undefined}>
                <colgroup>
                    <col style={{ width: 36 }} />
                    {cols.map((c, i) => <col key={c.k} style={{ width: `${widths[i]}%` }} />)}
                    {showBy && <col style={{ width: "8%" }} />}
                    <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="sh-n">#</th>
                        {cols.map((c, i) => (
                            <th key={c.k} className={c.type === "num" ? "r" : undefined}>
                                {c.label}
                                {resizable && i < cols.length - 1 && (
                                    <span className={cx("sh-resize", dragging === i && "on")} role="separator" aria-orientation="vertical"
                                        aria-label={`Resize ${c.label}`} title="Drag to resize · double-click to reset"
                                        onPointerDown={(e) => startResize(i, e)} onDoubleClick={resetWidths} />
                                )}
                            </th>
                        ))}
                        {showBy && <th>Added by</th>}
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => {
                        const isLocked = (k: ColKey) => locked?.(r, k) ?? false;
                        const bad = (k: ColKey) => (tried || left.has(`${row.key}:${k}`) ? problems?.[r]?.[k] : undefined);
                        // each message once, even when two cells share it
                        const said = [...new Set(cols.map((c) => bad(c.k)).filter((m): m is string => !!m))];
                        return (
                            <Fragment key={row.id ?? row.key}>
                                <tr className={cx("sh-row", cols.every((c) => isLocked(c.k)) && "sh-ro", !rowUsed(row) && "sh-blank", row.cls)} title={row.title}>
                                    <td className="sh-n">{offset + r + 1}</td>
                                    {cols.map((col, c) => (
                                        <Cell key={col.k} col={col} n={offset + r + 1} r={r} c={c} value={row[col.k]} readOnly={isLocked(col.k)} bad={bad(col.k)} dash={dash} eager={eager}
                                            options={choices?.(r, col.k)}
                                            onCommit={(v, typing) => onCell(r, col.k, v, typing)} onLeave={() => leave(row, col.k)} onNav={(dir) => nav(r, c, dir)}
                                            onPaste={onPaste ? (t) => onPaste(r, c, t) : undefined} />
                                    ))}
                                    {showBy && <td className="muted sh-by trunc">{row.by ?? ""}</td>}
                                    <td className="sh-act">
                                        {onDelete && (canDelete?.(r) ?? true) && (rowUsed(row) || row.id != null) && <DeleteButton onDelete={() => onDelete(r)} />}
                                    </td>
                                </tr>
                                {said.length > 0 && (
                                    <tr className="sh-err">
                                        <td colSpan={cols.length + 2 + (showBy ? 1 : 0)} style={{ padding: "4px 12px", height: "auto" }}>
                                            {said.map((m, i) => <FieldError key={i} message={`Row ${offset + r + 1}: ${m}`} />)}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
                {foot}
            </table>
        </div>
    );
}
