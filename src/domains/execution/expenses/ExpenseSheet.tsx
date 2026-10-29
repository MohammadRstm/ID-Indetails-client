import { useEffect, useState, type ReactNode } from "react";
import { loadFailed } from "@/api/queryState";
import { toApiError } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useAccountLabels } from "@/domains/shared/accountLabels/accountLabelsApi";
import FormFailure from "@/domains/shared/projects/FormFailure";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { useProtonForm } from "@/domains/shared/proton/formFill";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { siteMoneyOf } from "../projects/siteMoney";
import ExpenseGrid, { type GridRow } from "./ExpenseGrid";
import {
    BLOCK, blankRow, blankRows, CATEGORIES, COLS, costOf, CURRENCIES, entryOf, joinTotals, labelChoices, link, listTotals, pasteInto, rowOf, rowProblems, rowUsed,
    serverProblems, totalsOf, withServerProblems, writeTotals, type Choices, type ColKey, type Row,
} from "./expenseRules";
import { useAddExpenses, useAllExpenses } from "./expensesApi";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Every row in use: ten more. */
const grow = (list: Row[]) => (list.filter(rowUsed).length >= list.length ? list.concat(blankRows(BLOCK)) : list);
/** The rows a saved batch took off the top, with blank rows to keep the sheet a block long. */
function dropSaved(list: Row[], count: number) {
    let left = count;
    const next = list.filter((r) => !(left > 0 && rowUsed(r) && left--));
    return next.length < BLOCK ? next.concat(blankRows(BLOCK - next.length)) : next;
}

/**
 * The Add expenses sheet (the prototype's EX.MaterialSheet): rows typed like a spreadsheet, or pasted straight
 * from Excel, and added together. What is already recorded sits above, read-only, so nothing is typed twice.
 * Amounts in dollars and in pounds are totalled apart.
 */
export default function ExpenseSheet({ project, onClose }: { project: Project; onClose: () => void }) {
    const saved = useAllExpenses(project.id);
    const labels = useAccountLabels();
    const permissions = usePermissions();
    const client = project.billingType === "client" && !!project.client;
    const x = client && permissions.has(P.FINANCIAL_VIEW) && project.money ? siteMoneyOf(project.money) : null;
    const cols = COLS;
    const [rows, setRows] = useState(() => blankRows(BLOCK));
    // a saved batch leaves the sheet at once, so a failure further on never sends it twice
    const add = useAddExpenses(project.id, (count) => setRows((current) => dropSaved(current, count)));
    const [tried, setTried] = useState(false);
    // Proton types rows into the empty ones below what the person typed; a unit cost only when money actions are on and it was typed
    const proton = useProtonForm("materials", project.id, (fill) => {
        const given = fill.materials?.rows ?? [];
        if (given.length === 0) return [];
        const text = (n: number | null | undefined) => (n == null ? "" : String(n));
        setRows((current) => {
            let next = current.filter(rowUsed);
            next = next.concat(given.map((g) => link({
                ...blankRow(), name: g.type ?? "", quantity: text(g.quantity), unit: g.unit ?? "", unitCost: text(g.unitCost), supplier: g.supplier ?? "", note: g.note ?? "",
            }, "unitCost")));
            return next.length < BLOCK ? next.concat(blankRows(BLOCK - next.length)) : grow(next);
        });
        return [plural(given.length, "expense")];
    });

    // the recorded expenses, oldest first
    const items = (saved.data?.items ?? []).slice().reverse();
    const recorded: GridRow[] = items.map((e) => ({ ...rowOf(e), id: e.id, by: e.addedBy.name }));
    const N = recorded.length;
    const used = rows.filter(rowUsed);
    // what the API refused on the last try, beside what it was about; it goes as soon as something is changed
    const refused = serverProblems(rows, toApiError(add.error).fieldErrors);
    const problems = withServerProblems(rows.map(rowProblems), refused);
    const nBad = problems.filter(Boolean).length;
    const newTotals = totalsOf(used.map((r) => ({ currency: r.currency, cost: costOf(r) })));
    const dollars = newTotals.find((t) => t.currency === "USD")?.total ?? 0;
    const pounds = newTotals.filter((t) => t.currency !== "USD");
    const recordedTotals = saved.data ? listTotals(saved.data.all) : [];
    const choices: Choices = { currency: CURRENCIES, category: CATEGORIES, accountLabelId: labelChoices(labels.data) };

    const edited = () => { if (add.error) add.reset(); };
    // live, on every keystroke: quantity or unit cost typed → the amount follows; an amount over both → the unit cost
    function setCell(r: number, k: ColKey, v: string) {
        edited();
        setRows((current) => {
            const next = current.slice();
            let row = { ...next[r] };
            row[k] = v;
            if (k === "quantity" || k === "unitCost" || k === "amount") row = link(row, k);
            next[r] = row;
            return grow(next);
        });
    }
    function removeRow(r: number) {
        edited();
        setRows((current) => {
            const next = current.filter((_, i) => i !== r);
            return next.length < BLOCK ? next.concat(blankRows(BLOCK - next.length)) : next;
        });
    }
    function submit() {
        setTried(true);
        if (nBad || !used.length) return;
        add.mutate(used.map(entryOf), {
            onSuccess: () => {
                toast({ text: `Added ${plural(used.length, "expense")}`, sub: `${writeTotals(newTotals)} in total · ${project.title}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    function close() {
        if (used.length && !window.confirm(`Discard the ${plural(used.length, "expense")} typed so far?`)) return;
        onClose();
    }

    const shown: GridRow[] = recorded.concat(rows.map((r, i) => ({ ...r, cls: i === 0 && N ? "sh-first-new" : undefined })));

    return (
        <Modal size="xl mat-sheet" flush title="Add expenses" sub={project.title} onClose={close}
            foot={
                <>
                    <div className="grow">
                        {used.length ? <><b className="mono" style={{ color: "var(--ink)" }}>{writeTotals(newTotals)}</b> · {plural(used.length, "new expense")}</> : "Nothing new typed yet"}
                        {N > 0 && <span className="muted"> · {used.length ? `${writeTotals(joinTotals(recordedTotals, newTotals))} for the site with them` : `${writeTotals(recordedTotals)} recorded so far`}</span>}
                        {tried && nBad > 0 && <span className="sh-warn"> · {nBad} row{nBad === 1 ? " needs" : "s need"} fixing - the messages under them say what</span>}
                        {add.error && <> · <FormFailure error={add.error} onForced={onClose} /></>}
                    </div>
                    <button className="btn" onClick={close}>Cancel</button>
                    <button className="btn btn-primary" disabled={!used.length || add.isPending} onClick={submit}>
                        <Icon name="checkCircle" />{add.isPending ? "Adding…" : `Add ${used.length || ""} expense${used.length === 1 ? "" : "s"}`}
                    </button>
                </>
            }>
            {x && (
                <div className={cx("xm-strip", r2(x.received - (x.spent + dollars)) < 0 && "neg")} role="status">
                    <span>Received <b className="mono">{money.exact(x.received)}</b></span>
                    <span className="muted">·</span>
                    <span>Spent <b className="mono">{money.exact(r2(x.spent + dollars))}</b>{dollars > 0 && <> <em className="mono">(+{money.exact(dollars)} here)</em></>}</span>
                    <span className="muted">→</span>
                    <span>Profit <b className="mono xm-profit">{money.exact(r2(x.received - x.spent - dollars))}</b>{dollars > 0 && <> <em className="mono">(−{money.exact(dollars)})</em></>}</span>
                    {pounds.length > 0 && <span className="muted">· plus {writeTotals(pounds)}, counted at the day's rate once added</span>}
                </div>
            )}
            <FilledNote fields={proton.filled} />
            <div className="sh-help" {...proton.guard}>
                <span><kbd>Enter</kbd> next column</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> back</span>
                <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move between cells</span><span>Paste straight from Excel</span>
                <span className="grow" />
                <span className="muted">{N ? `${N} already recorded · ` : ""}{rows.length} new rows · more are added as you fill them</span>
            </div>
            <div className="sh-help">
                <span className="muted">
                    Qty and unit cost are optional. With both, Amount is worked out for you - type an Amount over them and the unit cost is adjusted to match. Without them, type the Amount.
                    A new row is in dollars, spent today, under Materials; change them where they differ. Dollars and pounds are totalled apart.
                </span>
            </div>
            {loadFailed(saved) ? <div className="panel-body"><LoadError error={saved.error} retry={() => saved.refetch()} what="the expenses" /></div>
                : !saved.data ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                <SheetGrid first={N}>
                    <ExpenseGrid cols={cols} rows={shown} eager showBy={N > 0} minWidth={1240}
                        problems={[...recorded.map(() => null), ...problems]} tried={tried}
                        choices={(r, k) => (k === "accountLabelId" ? labelChoices(labels.data, r < N ? items[r].accountLabel : null) : choices[k] ?? [])}
                        locked={(r) => r < N}
                        canDelete={(r) => r >= N}
                        onCell={(r, k, v) => { if (r >= N) setCell(r - N, k, v); }}
                        onGrow={() => setRows((current) => current.concat(blankRows(BLOCK)))}
                        onPaste={(r, c, t) => { if (r >= N) { edited(); setRows((current) => grow(pasteInto(current, r - N, c, t, cols, choices))); } }}
                        onDelete={(r) => { if (r >= N) removeRow(r - N); }} />
                </SheetGrid>
            )}
        </Modal>
    );
}

/** Puts the cursor in the first new row once the sheet is open. */
function SheetGrid({ first, children }: { first: number; children: ReactNode }) {
    useEffect(() => {
        const t = setTimeout(() => document.querySelector<HTMLInputElement>(`.mat-sheet [data-r="${first}"][data-c="0"]`)?.focus(), 60);
        return () => clearTimeout(t);
    }, [first]);
    return <>{children}</>;
}
