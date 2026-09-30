import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { COLS, resolveUnit, rowUsed, UNITS, type Col, type ColKey, type Row, type RowProblems } from "./materialRules";

type Dir = "next" | "prev" | "up" | "down" | "left" | "right";
export type GridRow = Row & { id?: number; by?: string; cls?: string; title?: string };

type CellProps = {
    col: Col;
    /** The row's number as shown, for the cell's name ("Type 3"). */
    n: number;
    r: number;
    c: number;
    value: string;
    readOnly: boolean;
    bad?: string;
    dash?: boolean;
    /** A draft sheet hands every keystroke up; a saved grid only what is left in the cell. */
    eager?: boolean;
    onCommit: (value: string, typing?: boolean) => void;
    onNav: (dir: Dir) => void;
    onPaste?: (text: string) => void;
};

/**
 * One cell: its own text while it is typed in, handed up on Enter, Tab or leaving it. The unit is typed too,
 * with a short list under the cell; the first match is taken.
 */
function Cell({ col, n, r, c, value, readOnly, bad, dash, eager, onCommit, onNav, onPaste }: CellProps) {
    const combo = col.type === "combo";
    const [text, setText] = useState(value);
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
        return col.type === "num" ? t.replace(/[^0-9.]/g, "") : t;
    }
    function commit(t: string) {
        editing.current = false;
        setDirty(false);
        setOpen(false);
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

    return (
        <td className={cx("sh-cell", col.type === "num" && "r", bad && "bad", open && "open")} title={bad}>
            <input className={cx("sh-in", col.type !== "text" && "mono")} data-r={r} data-c={c} value={dirty ? text : value}
                aria-label={`${col.label} ${n}`} placeholder={dash && col.dash ? "-" : ""} inputMode={col.type === "num" ? "decimal" : undefined}
                autoComplete="off" spellCheck={false} style={col.strong ? { fontWeight: 600 } : undefined} disabled={readOnly}
                onFocus={() => {
                    editing.current = true;
                    moved.current = false;
                    setDirty(false);
                    setText(value);
                    if (combo) { setOpen(true); setHi(Math.max(0, UNITS.indexOf(value))); }
                }}
                onBlur={() => { if (editing.current) commit(text); }}
                onChange={(e) => {
                    const t = e.target.value;
                    setText(t);
                    setDirty(true);
                    setHi(0);
                    moved.current = false;
                    if (combo) setOpen(true);
                    if (eager) onCommit(combo ? t : valueOf(t), true);
                }}
                onKeyDown={onKey}
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
    const el = root?.querySelector<HTMLInputElement>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el || el.disabled) return false;
    el.focus();
    el.select();
    return true;
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
    problems?: RowProblems[] | null;
    onCell: (r: number, k: ColKey, value: string, typing?: boolean) => void;
    onGrow?: () => void;
    onPaste?: (r: number, c: number, text: string) => void;
    onDelete?: (r: number) => void;
    /** A column after the cells (the material profit), and its heading. */
    after?: (row: GridRow, r: number) => ReactNode;
    afterLabel?: string;
    foot?: ReactNode;
};

/**
 * Materials in rows, as site staff keep them (the prototype's sheet): Enter goes to the next cell and on to
 * the next row, Shift+Enter back, the arrows between cells. The grid knows nothing about saving.
 */
export default function MaterialGrid({ rows, cols = COLS, offset = 0, showBy, dash, eager, locked, canDelete, problems, onCell, onGrow, onPaste, onDelete, after, afterLabel, foot }: GridProps) {
    const ref = useRef<HTMLDivElement>(null);
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
            <table className="sh">
                <colgroup>
                    <col style={{ width: 36 }} />
                    {cols.map((c) => <col key={c.k} style={{ width: c.w }} />)}
                    {after && <col style={{ width: "7%" }} />}
                    {showBy && <col style={{ width: "9%" }} />}
                    <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="sh-n">#</th>
                        {cols.map((c) => <th key={c.k} className={c.type === "num" ? "r" : undefined}>{c.label}</th>)}
                        {after && <th className="r">{afterLabel}</th>}
                        {showBy && <th>Added by</th>}
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => {
                        const isLocked = (k: ColKey) => locked?.(r, k) ?? false;
                        const bad = problems?.[r];
                        return (
                            <tr key={row.id ?? `new-${r}`} className={cx("sh-row", cols.every((c) => isLocked(c.k)) && "sh-ro", !rowUsed(row) && "sh-blank", row.cls)} title={row.title}>
                                <td className="sh-n">{offset + r + 1}</td>
                                {cols.map((col, c) => (
                                    <Cell key={col.k} col={col} n={offset + r + 1} r={r} c={c} value={row[col.k]} readOnly={isLocked(col.k)} bad={bad?.[col.k]} dash={dash} eager={eager}
                                        onCommit={(v, typing) => onCell(r, col.k, v, typing)} onNav={(dir) => nav(r, c, dir)}
                                        onPaste={onPaste ? (t) => onPaste(r, c, t) : undefined} />
                                ))}
                                {after && <td className="r sh-after">{after(row, r)}</td>}
                                {showBy && <td className="muted sh-by trunc">{row.by ?? ""}</td>}
                                <td className="sh-act">
                                    {onDelete && (canDelete?.(r) ?? true) && (rowUsed(row) || row.id != null) && <DeleteButton onDelete={() => onDelete(r)} />}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                {foot}
            </table>
        </div>
    );
}
