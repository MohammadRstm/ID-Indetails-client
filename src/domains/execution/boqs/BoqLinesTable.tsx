import { Fragment } from "react";
import { FieldError } from "@/shared/components/Forms/Field";
import { BOQ_NUMBER, BOQ_PERCENT, type NumberShape } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import type { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { fitSigned, lineChanged, type DraftProblems, type LineDraft } from "./boqDraft";
import type { BoqLine } from "./boqsApi";

type Field = "code" | "description" | "quantity" | "waste" | "unit" | "rate";
type Col = { field: Field; label: string; w: string; shape?: NumberShape };

const COLS: Col[] = [
    { field: "code", label: "Code", w: "8%" },
    { field: "description", label: "Description", w: "27%" },
    { field: "quantity", label: "Quantity", w: "9%", shape: BOQ_NUMBER },
    { field: "waste", label: "Waste %", w: "8%", shape: BOQ_PERCENT },
];
const AFTER: Col[] = [
    { field: "unit", label: "Unit", w: "7%" },
    { field: "rate", label: "Rate", w: "10%", shape: BOQ_NUMBER },
];

/** Where a figure the API works out stands until the line is saved. */
const UNSAVED = "—";
const quantityText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type Props = {
    lines: LineDraft[];
    /** The lines of the last save: the final quantity and total of a line come from there, never from the typed numbers. */
    saved: BoqLine[];
    readOnly: boolean;
    problems: DraftProblems;
    errors: ReturnType<typeof useFormErrors>;
    onChange: (key: string, field: Field, value: string) => void;
    onMove: (index: number, by: -1 | 1) => void;
    onRemove: (index: number) => void;
};

/**
 * A BOQ's lines, one row each: what is typed, then what the API worked out when the BOQ was last saved. A line
 * changed since then shows a dash in the cells it works out, until it is saved. Errors show under the line, as it
 * is left or once a save was tried.
 */
export default function BoqLinesTable({ lines, saved, readOnly, problems, errors, onChange, onMove, onRemove }: Props) {
    const byId = new Map(saved.map((l) => [l.id, l]));

    function cell(l: LineDraft, n: number, c: Col) {
        const text = l[c.field];
        const bad = errors.show(`${l.key}:${c.field}`, problems.line[l.key]?.[c.field]);
        const numeric = c.shape != null;
        return (
            <td key={c.field} className={cx("sh-cell", numeric && "r", bad && "bad")}>
                <input className={cx("sh-in", numeric && "mono")} aria-label={`${c.label} ${n}`} aria-invalid={bad ? true : undefined}
                    value={text} disabled={readOnly} autoComplete="off" spellCheck={false} inputMode={numeric ? "decimal" : undefined}
                    onBlur={errors.touch(`${l.key}:${c.field}`)}
                    onChange={(e) => {
                        // a minus is typed and then refused with a reason (only a VO's rate may be negative), not dropped
                        const next = c.shape ? fitSigned(e.target.value, c.shape, text, c.field !== "waste") : e.target.value;
                        if (next != null) onChange(l.key, c.field, next);
                    }} />
            </td>
        );
    }

    return (
        <div className="sh-wrap">
            <table className="sh" aria-label="Lines">
                <colgroup>
                    <col style={{ width: 36 }} />
                    {COLS.map((c) => <col key={c.field} style={{ width: c.w }} />)}
                    <col style={{ width: "9%" }} />
                    {AFTER.map((c) => <col key={c.field} style={{ width: c.w }} />)}
                    <col style={{ width: "11%" }} />
                    {!readOnly && <col style={{ width: 92 }} />}
                </colgroup>
                <thead>
                    <tr>
                        <th className="sh-n">#</th>
                        {COLS.map((c) => <th key={c.field} className={c.shape ? "r" : undefined}>{c.label}</th>)}
                        <th className="r">Final quantity</th>
                        {AFTER.map((c) => <th key={c.field} className={c.shape ? "r" : undefined}>{c.label}</th>)}
                        <th className="r">Total</th>
                        {!readOnly && <th />}
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => {
                        const n = i + 1;
                        const was = l.id == null ? undefined : byId.get(l.id);
                        const stale = lineChanged(l, was);
                        const said = (Object.keys(problems.line[l.key] ?? {}) as Field[])
                            .map((f) => errors.show(`${l.key}:${f}`, problems.line[l.key]?.[f])).filter((m): m is string => !!m);
                        return (
                            <Fragment key={l.key}>
                                <tr className="sh-row">
                                    <td className="sh-n">{n}</td>
                                    {COLS.map((c) => cell(l, n, c))}
                                    <td className="r mono sh-total" title={stale ? "Worked out when the BOQ is saved" : undefined}>
                                        {stale || !was ? UNSAVED : quantityText(was.finalQuantity)}
                                    </td>
                                    {AFTER.map((c) => cell(l, n, c))}
                                    <td className="r mono sh-total" title={stale ? "Worked out when the BOQ is saved" : undefined}>
                                        {stale || !was ? UNSAVED : money.exact(was.totalUsd, "USD", { cents: true })}
                                    </td>
                                    {!readOnly && (
                                        <td className="sh-act">
                                            <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Move line ${n} up`} disabled={i === 0} onClick={() => onMove(i, -1)}><Icon name="arrowUp" /></button>
                                            <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Move line ${n} down`} disabled={i === lines.length - 1} onClick={() => onMove(i, 1)}><Icon name="arrowDown" /></button>
                                            <button type="button" className="sh-del" aria-label={`Remove line ${n}`} title="Remove" onClick={() => onRemove(i)}><Icon name="trash" /></button>
                                        </td>
                                    )}
                                </tr>
                                {said.length > 0 && (
                                    <tr className="boq-line-err">
                                        <td colSpan={readOnly ? 9 : 10} style={{ padding: "4px 12px", height: "auto" }}>
                                            {said.map((m) => <FieldError key={m} message={`Line ${n}: ${m}`} />)}
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
