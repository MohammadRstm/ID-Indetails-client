import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { Bar } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate, fmtDayDateY, fmtNumber } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";
import { isSiteOpen } from "../projects/siteMoney";
import {
    executedQuantityError, PROGRESS_MAX_LINES, PROGRESS_NOTE_MAX, quantityOf, quantityText, useBoqProgress, useRecordBoqProgress,
    type BoqProgress, type BoqProgressLine,
} from "./boqProgressApi";

const cents = (n: number) => money.exact(n, "USD", { cents: true });
/** How many of the latest records the panel lists. */
const HISTORY_SHOWN = 10;

/**
 * A client site's progress by value: each line of its agreed client BOQ and agreed VOs with its quantity, what was
 * executed on it as of a day (today unless another is picked) and its progress, and the site's progress by value. The
 * values show only to whoever sees money (the API sends them null to everyone else). Pricing managers and the site's
 * own staff record executed quantities while it is open. The API decides who reads which site: someone it refuses sees
 * nothing here. Every figure is the API's.
 */
export default function BoqProgressPanel({ project }: { project: Project }) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const today = companyToday();
    const [asOf, setAsOf] = useState(today);
    const [recording, setRecording] = useState(false);
    const onTeam = (project.staff ?? []).some((s) => s.id === me.id);
    const staffWrites = onTeam && permissions.has(P.SITE_LOG_CREATE);
    const reads = project.billingType === "client"
        && (permissions.hasAny(P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE, P.SITE_LOG_VIEW_ALL) || staffWrites);
    const writes = isSiteOpen(project) && (permissions.has(P.PROJECT_PRICING_MANAGE) || staffWrites);
    const query = useBoqProgress(project.id, asOf, reads);
    if (!reads) return null;
    // not on the site's team, or a site whose work isn't priced by BOQs: the API says no, so nothing shows
    const status = query.isError ? toApiError(query.error).status : 0;
    if (status === 403 || status === 422) return null;
    const data = query.data;
    const recordable = data?.lines.filter((l) => l.takesProgress) ?? [];

    return (
        <section className="panel mt" aria-label="Progress by value">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Progress by value</div>
                    <div className="panel-sub">The work executed on the agreed BOQ and VOs, line by line, as the site records it.</div>
                </div>
                <div className="panel-tools">
                    <DateInput className="input" style={{ width: 140 }} value={asOf} max={today} required aria-label="As of"
                        onChange={(day) => setAsOf(day || today)} />
                    {writes && recordable.length > 0 && (
                        <button className="btn btn-sm btn-primary" onClick={() => setRecording(true)}><Icon name="plus" />Record progress</button>
                    )}
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the site's progress" />
                    : !data ? <SkeletonLines lines={5} />
                        : data.lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>No agreed BOQ yet. Progress is recorded on the lines of the agreed client BOQ and VOs.</p>
                            : (
                                <>
                                    <Figures progress={data} />
                                    <Lines progress={data} />
                                    <History progress={data} />
                                </>
                            )}
            </div>
            {recording && data && <RecordProgressModal project={project} progress={data} onClose={() => setRecording(false)} />}
        </section>
    );
}

/** The site's progress by value and, for whoever sees money, the values it is worked out from. */
function Figures({ progress: d }: { progress: BoqProgress }) {
    return (
        <div className="xm-owed" role="group" aria-label="Site progress">
            <div>
                <span>Executed</span>
                <b className="mono">{d.progress != null ? money.pct(d.progress) : "-"}</b>
                <em>{d.progress != null ? `of the agreed work, by value, as of ${fmtDate(d.asOf)}` : "nothing recorded yet"}</em>
            </div>
            {d.valueExecuted != null && <div><span>Value executed</span><b className="mono">{cents(d.valueExecuted)}</b><em>executed quantity × unit price</em></div>}
            {d.agreedValue != null && <div><span>Agreed value</span><b className="mono">{cents(d.agreedValue)}</b><em>the agreed BOQ and VOs' work, before TVA</em></div>}
        </div>
    );
}

/** Each agreed line: its quantity, what was executed on it and its progress, and the value executed for whoever sees money. */
function Lines({ progress: d }: { progress: BoqProgress }) {
    const values = d.lines.some((l) => l.valueExecuted != null);
    return (
        <div className="tbl-wrap mt">
            <table className="tbl tbl-min-sm" aria-label="Executed quantities">
                <thead>
                    <tr>
                        <th>Line</th>
                        <th>Unit</th>
                        <th className="r">Quantity</th>
                        <th className="r">Executed</th>
                        <th style={{ width: 150 }}>Progress</th>
                        {values && <th className="r">Value executed</th>}
                    </tr>
                </thead>
                <tbody>
                    {d.lines.map((l) => (
                        <tr key={l.boqLineId} aria-label={l.description}>
                            <td>
                                <div className="trunc">{l.code && <span className="mono muted">{l.code} </span>}<b>{l.description}</b></div>
                                <div className="muted trunc" style={{ fontSize: "11.5px" }}>{[l.boqNumber, l.boqTitle].filter(Boolean).join(" · ")}</div>
                            </td>
                            <td className="muted">{l.unit ?? "-"}</td>
                            <td className="r mono">{fmtNumber(l.quantity)}</td>
                            <td className="r mono">
                                {l.executedQuantity != null ? fmtNumber(l.executedQuantity) : <span className="muted">-</span>}
                                {l.executedOn && <div className="muted" style={{ fontSize: "11.5px" }}>on {fmtDate(l.executedOn)}</div>}
                            </td>
                            <td><LineProgress line={l} /></td>
                            {values && <td className="r mono">{l.valueExecuted != null ? cents(l.valueExecuted) : "-"}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LineProgress({ line: l }: { line: BoqProgressLine }) {
    if (!l.takesProgress) return <span className="muted" title="A negative rate takes work away: nothing on it is executed">Takes work away</span>;
    if (l.progress == null) return <span className="muted">Not recorded</span>;
    return <Bar value={l.progress * 100} tone={l.progress > 1 ? "warn" : undefined} />;
}

/** The latest records up to the day shown, newest first, in the daily log's own list. */
function History({ progress: d }: { progress: BoqProgress }) {
    if (d.history.length === 0) return null;
    const lineOf = new Map(d.lines.map((l) => [l.boqLineId, l]));
    const shown = d.history.slice(0, HISTORY_SHOWN);
    return (
        <section className="boq-sec mt" aria-label="Latest records">
            <h3 className="boq-sec-head">Latest records<span className="muted num">{d.history.length}</span></h3>
            <ol className="site-logs" aria-label="Progress records">
                {shown.map((r) => {
                    const line = lineOf.get(r.boqLineId);
                    return (
                        <li key={r.id} className="site-log">
                            <span className="muted" style={{ fontSize: 12 }}>{fmtDayDateY(r.recordedOn)} · {r.recordedBy.name}</span>
                            <div style={{ marginTop: 2 }}>
                                <b>{line?.description ?? "A line"}</b>: <span className="mono">{fmtNumber(r.executedQuantity)}</span>{line?.unit ? ` ${line.unit}` : ""} executed
                                {r.note && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{r.note}</div>}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

/**
 * "Record progress": one field per line that takes progress, starting at its executed quantity as shown, the day the
 * quantities stand at (today unless another is picked) and a note. Only the lines changed are sent, so the others keep
 * theirs. What the API refuses shows beside its field until something is changed.
 */
function RecordProgressModal({ project, progress, onClose }: { project: Project; progress: BoqProgress; onClose: () => void }) {
    const save = useRecordBoqProgress(project.id);
    const errors = useFormErrors();
    const today = companyToday();
    const lines = progress.lines.filter((l) => l.takesProgress);
    const [typed, setTyped] = useState<Record<number, string>>(
        () => Object.fromEntries(lines.map((l) => [l.boqLineId, quantityText(l.executedQuantity)])));
    const [day, setDay] = useState(today);
    const [note, setNote] = useState("");
    // the lines sent, in order, so a refusal of lines[i] shows beside its field
    const [sent, setSent] = useState<number[]>([]);
    const refused = toApiError(save.error);

    const textOf = (l: BoqProgressLine) => typed[l.boqLineId] ?? "";
    const unchanged = (l: BoqProgressLine) => {
        const t = textOf(l).trim(), was = quantityText(l.executedQuantity);
        return t === was || (t !== "" && was !== "" && !executedQuantityError(t, l.quantity) && quantityOf(t) === Number(was));
    };
    const lineError = (l: BoqProgressLine) => (unchanged(l) ? null : executedQuantityError(textOf(l), l.quantity));
    const changed = lines.filter((l) => !unchanged(l));
    const invalid = lines.some((l) => lineError(l));
    const dayError = !day ? "Pick the day the quantities stand at." : day > today && "Pick today or a day before.";
    const noteError = note.trim().length > PROGRESS_NOTE_MAX && `At most ${PROGRESS_NOTE_MAX} characters.`;
    const countError = changed.length === 0 ? "Change the executed quantity of at least one line."
        : changed.length > PROGRESS_MAX_LINES && `At most ${PROGRESS_MAX_LINES} lines at a time.`;
    const fieldRefused = (l: BoqProgressLine) => {
        const i = sent.indexOf(l.boqLineId);
        return i < 0 ? undefined : refused.fieldErrors[`lines[${i}].executedQuantity`] ?? refused.fieldErrors[`lines[${i}].boqLineId`]
            ?? refused.fieldErrors[`lines[${i}].note`] ?? refused.fieldErrors[`lines[${i}]`];
    };
    // the foot has the failure only when no field is what the API named
    const anyFieldRefused = refused.fieldErrors.lines ?? refused.fieldErrors.recordedOn ?? lines.map(fieldRefused).find((m) => m != null);

    function changes() {
        if (save.error) save.reset();
    }

    function submit() {
        if (save.isPending) return;
        if (invalid || dayError || noteError || countError) return errors.tried();
        const words = note.trim();
        setSent(changed.map((l) => l.boqLineId));
        save.mutate({
            recordedOn: day,
            lines: changed.map((l) => ({ boqLineId: l.boqLineId, executedQuantity: quantityOf(textOf(l)), ...(words ? { note: words } : {}) })),
        }, {
            onSuccess: () => {
                toast({ text: "Progress recorded", sub: `${project.title} · ${plural(changed.length, "line")}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Record progress" sub={project.title} onClose={save.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error && !anyFieldRefused ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(save.error)}</span>
                            : "Quantities only: the server works out every value."}
                    </div>
                    <button className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="hint" style={{ marginBottom: 10 }}>
                For each line, everything executed so far in its unit, not only the day's work. Leave a line as it is to keep its quantity.
            </div>
            {lines.map((l) => (
                <div key={l.boqLineId} className="field">
                    <div className="row" style={{ gap: 10, alignItems: "center" }}>
                        <label className="label grow" htmlFor={`bp-${l.boqLineId}`} style={{ margin: 0 }}>
                            {l.code && <span className="mono muted">{l.code} </span>}{l.description}
                            <span className="muted" style={{ fontWeight: 400 }}> · of {fmtNumber(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</span>
                        </label>
                        <input id={`bp-${l.boqLineId}`} className="input mono" style={{ width: 120, textAlign: "right" }} inputMode="decimal"
                            value={textOf(l)} placeholder="None yet" aria-invalid={lineError(l) || fieldRefused(l) ? true : undefined}
                            onChange={(e) => { changes(); setTyped((t) => ({ ...t, [l.boqLineId]: e.target.value })); }}
                            onBlur={errors.touch(`bp-${l.boqLineId}`)} />
                        <span className="muted" style={{ minWidth: 28 }}>{l.unit ?? ""}</span>
                    </div>
                    <FieldError message={errors.show(`bp-${l.boqLineId}`, lineError(l)) ?? fieldRefused(l)} />
                </div>
            ))}
            <FieldError message={errors.show("bp-lines", !invalid && countError) ?? refused.fieldErrors.lines} />
            <div className="field mt">
                <label className="label required" htmlFor="bp-day">Quantities as of</label>
                <DateInput id="bp-day" className="input" style={{ width: 160 }} value={day} max={today} required aria-label="Quantities as of"
                    onChange={(v) => { changes(); setDay(v); }} />
                <FieldError message={errors.show("bp-day", dayError) ?? refused.fieldErrors.recordedOn} />
                <div className="hint">A line recorded again on the same day replaces that day's quantity.</div>
            </div>
            <div className="field">
                <label className="label" htmlFor="bp-note">Note</label>
                <AutoGrowTextarea id="bp-note" className="input" minRows={2} maxRows={6} maxLength={PROGRESS_NOTE_MAX} value={note}
                    placeholder="e.g. North wall tiled." onChange={(e) => { changes(); setNote(e.target.value); }} onBlur={errors.touch("bp-note")} />
                <FieldError message={errors.show("bp-note", noteError)} />
            </div>
        </Modal>
    );
}
