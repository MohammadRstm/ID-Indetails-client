import { useEffect, useState, type ReactNode } from "react";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
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
import MaterialGrid, { type GridRow } from "./MaterialGrid";
import { BLOCK, blankRows, COLS, costOf, entryOf, link, pasteInto, rowOf, rowProblems, rowUsed, type ColKey, type Row } from "./materialRules";
import { useAddMaterials, useAllMaterials } from "./materialsApi";
import { loadFailed } from "@/api/queryState";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { useProtonForm } from "@/domains/shared/proton/formFill";

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
 * The Add materials sheet (the prototype's EX.MaterialSheet): rows typed like a spreadsheet, or pasted straight
 * from Excel, and added together. What is already recorded sits above, read-only, so nothing is typed twice.
 */
export default function MaterialSheet({ project, onClose }: { project: Project; onClose: () => void }) {
    const saved = useAllMaterials(project.id);
    const permissions = usePermissions();
    const client = project.billingType === "client" && !!project.client;
    const x = client && permissions.has(P.FINANCIAL_VIEW) && project.money ? siteMoneyOf(project.money) : null;
    const cols = COLS;
    const [rows, setRows] = useState(() => blankRows(BLOCK));
    // a saved batch leaves the sheet at once, so a failure further on never sends it twice
    const add = useAddMaterials(project.id, (count) => setRows((current) => dropSaved(current, count)));
    const [tried, setTried] = useState(false);
    // Proton types rows into the empty ones below what the person typed; a unit cost only when money actions are on and it was typed
    const proton = useProtonForm("materials", project.id, (fill) => {
        const given = fill.materials?.rows ?? [];
        if (given.length === 0) return [];
        const text = (n: number | null | undefined) => (n == null ? "" : String(n));
        setRows((current) => {
            let next = current.filter(rowUsed);
            next = next.concat(given.map((g) => link({
                ...blankRows(1)[0], name: g.type ?? "", quantity: text(g.quantity), unit: g.unit ?? "", unitCost: text(g.unitCost), supplier: g.supplier ?? "", note: g.note ?? "",
            }, "unitCost")));
            return next.length < BLOCK ? next.concat(blankRows(BLOCK - next.length)) : grow(next);
        });
        return [plural(given.length, "material")];
    });

    // the recorded materials, oldest first
    const recorded: GridRow[] = (saved.data?.items ?? []).slice().reverse().map((m) => ({ ...rowOf(m), id: m.id, by: m.addedBy.name }));
    const N = recorded.length;
    const recordedTotal = r2(recorded.reduce((t, r) => t + costOf(r), 0));
    const used = rows.filter(rowUsed);
    const problems = rows.map(rowProblems);
    const nBad = problems.filter(Boolean).length;
    // the prototype's words are about a missing type or cost; anything else is explained on its red cell
    const otherBad = problems.some((p) => p && Object.values(p).some((m) => m?.startsWith("At most")));
    const total = r2(used.reduce((t, r) => t + costOf(r), 0));

    // live, on every keystroke: quantity or unit cost typed → the total follows; a total over both → the unit cost
    function setCell(r: number, k: ColKey, v: string) {
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
        setRows((current) => {
            const next = current.filter((_, i) => i !== r);
            return next.length < BLOCK ? next.concat(blankRows(BLOCK - next.length)) : next;
        });
    }
    function submit() {
        setTried(true);
        if (nBad || !used.length) return;
        add.mutate(used.map((r) => ({ ...entryOf(r), clientPrice: null })), {
            onSuccess: () => {
                toast({ text: `Added ${plural(used.length, "material")}`, sub: `${money.exact(total)} in total · ${project.title}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    function close() {
        if (used.length && !window.confirm(`Discard the ${plural(used.length, "material")} typed so far?`)) return;
        onClose();
    }

    const shown: GridRow[] = recorded.concat(rows.map((r, i) => ({ ...r, cls: i === 0 && N ? "sh-first-new" : undefined })));

    return (
        <Modal size="xl mat-sheet" flush title="Add materials" sub={project.title} onClose={close}
            foot={
                <>
                    <div className="grow">
                        {used.length ? <><b className="mono" style={{ color: "var(--ink)" }}>{money.exact(total)}</b> · {used.length} new material{used.length === 1 ? "" : "s"}</> : "Nothing new typed yet"}
                        {N > 0 && <span className="muted"> · {used.length ? `${money.exact(recordedTotal + total)} for the project with them` : `${money.exact(recordedTotal)} recorded so far`}</span>}
                        {tried && nBad > 0 && <span className="sh-warn"> · {nBad} row{nBad === 1 ? " needs" : "s need"} {otherBad ? "fixing - point at a red cell to see why" : "a type and a cost - quantity × unit cost, or a total"}</span>}
                        {add.error && <> · <FormFailure error={add.error} onForced={onClose} /></>}
                    </div>
                    <button className="btn" onClick={close}>Cancel</button>
                    <button className="btn btn-primary" disabled={!used.length || add.isPending} onClick={submit}>
                        <Icon name="checkCircle" />{add.isPending ? "Adding…" : `Add ${used.length || ""} material${used.length === 1 ? "" : "s"}`}
                    </button>
                </>
            }>
            {x && (
                <div className={cx("xm-strip", x.received - (x.spent + total) < 0 && "neg")} role="status">
                    <span>Received <b className="mono">{money.exact(x.received)}</b></span>
                    <span className="muted">·</span>
                    <span>Spent <b className="mono">{money.exact(r2(x.spent + total))}</b>{total > 0 && <> <em className="mono">(+{money.exact(total)} here)</em></>}</span>
                    <span className="muted">→</span>
                    <span>Profit <b className="mono xm-profit">{money.exact(r2(x.received - x.spent - total))}</b>{total > 0 && <> <em className="mono">(−{money.exact(total)})</em></>}</span>
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
                    Qty and unit cost are optional. With both, Total is worked out for you - type a Total over them and the unit cost is adjusted to match. Without them, type the Total.
                </span>
            </div>
            {loadFailed(saved) ? <div className="panel-body"><LoadError error={saved.error} retry={() => saved.refetch()} what="the materials" /></div>
                : !saved.data ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                <SheetGrid first={N}>
                    <MaterialGrid cols={cols} rows={shown} eager showBy={N > 0}
                        problems={tried ? [...recorded.map(() => null), ...problems] : null}
                        locked={(r) => r < N}
                        canDelete={(r) => r >= N}
                        onCell={(r, k, v) => { if (r >= N) setCell(r - N, k, v); }}
                        onGrow={() => setRows((current) => current.concat(blankRows(BLOCK)))}
                        onPaste={(r, c, t) => { if (r >= N) setRows((current) => grow(pasteInto(current, r - N, c, t, cols))); }}
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
