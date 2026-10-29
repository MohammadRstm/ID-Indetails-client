import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import HelpHint from "../../shared/help/HelpHint";
import type { Project } from "../../shared/projects/projectsApi";
import {
    SUPERVISION_AMOUNT_MAX, SUPERVISION_NOTE_MAX, useRemoveSupervision, useSupervisionWithdrawals, useTakeSupervision, type SupervisionWithdrawal,
} from "./accountApi";

const usd = (amount: number) => money.exact(amount, "USD", { cents: true });

/**
 * What the company has taken of a site's supervision out of the project account, day by day (financial:view to read,
 * payment:record to record and remove). It is not a cost: the site's profit doesn't move, only the cash in the account
 * and what is left to take. Recording and removing work on a finished site too.
 */
export default function SupervisionPanel({ project }: { project: Project }) {
    const permissions = usePermissions();
    const query = useSupervisionWithdrawals(project.id, true);
    const [dialog, setDialog] = useState<"record" | SupervisionWithdrawal | null>(null);
    const canWrite = permissions.has(P.PAYMENT_RECORD);
    const list = query.data;

    return (
        <section className="panel mt" aria-label="Supervision taken">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Supervision taken<HelpHint article="supervision-taken" label="supervision taken">What the company has taken of its supervision fee. It lowers the cash in the account and what is left to take, but it is not a cost, so profit stays as it is.</HelpHint></div>
                    <div className="panel-sub">What the company has taken of its supervision out of the project account. It isn't a cost: the profit doesn't change.</div>
                </div>
                {canWrite && (
                    <div className="panel-tools">
                        <button className="btn btn-sm" onClick={() => setDialog("record")}><Icon name="plus" />Record supervision taken</button>
                    </div>
                )}
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the supervision taken" /></div>
                : !list ? <div className="panel-body"><SkeletonLines lines={3} /></div>
                    : list.length === 0 ? <div className="panel-body"><p className="muted" style={{ margin: 0 }}>Nothing taken yet.</p></div> : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min-sm">
                                <thead>
                                    <tr><th className="nowrap">Day</th><th className="r">Amount</th><th>Note</th><th>Recorded by</th>{canWrite && <th />}</tr>
                                </thead>
                                <tbody>
                                    {list.map((w) => (
                                        <tr key={w.id}>
                                            <td className="nowrap">{fmtDateY(w.takenOn)}</td>
                                            <td className="r mono">{usd(w.amountUsd)}</td>
                                            <td className="muted trunc">{w.note || "-"}</td>
                                            <td className="muted nowrap">{w.createdBy?.name ?? "-"}</td>
                                            {canWrite && (
                                                <td className="r">
                                                    <button className="icon-btn" aria-label={`Remove the supervision taken on ${fmtDateY(w.takenOn)}`} title="Remove" onClick={() => setDialog(w)}>
                                                        <Icon name="trash" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            {canWrite && dialog === "record" && <RecordSupervisionModal project={project} onClose={() => setDialog(null)} />}
            {canWrite && dialog && dialog !== "record" && <RemoveSupervisionModal project={project} withdrawal={dialog} onClose={() => setDialog(null)} />}
        </section>
    );
}

/** The amount, the day (today, never later) and an optional note; what the API refuses shows beside its field until it is changed. */
function RecordSupervisionModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const today = companyToday();
    const take = useTakeSupervision(project.id);
    const [amount, setAmount] = useState<number | null>(null);
    const [day, setDay] = useState(today);
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const refused = toApiError(take.error);
    const edited = () => { if (take.error) take.reset(); };
    const amountError = !(amount && amount > 0) ? "Enter the amount taken."
        : amount > SUPERVISION_AMOUNT_MAX && `At most ${usd(SUPERVISION_AMOUNT_MAX)}.`;
    const dayError = !day ? "Pick the day it was taken." : day > today && "The day can't be in the future.";
    const noteError = note.trim().length > SUPERVISION_NOTE_MAX && `At most ${SUPERVISION_NOTE_MAX} characters.`;
    // the foot has the failure only when no field is what the API named
    const fieldRefused = refused.fieldErrors.amountUsd ?? refused.fieldErrors.takenOn ?? refused.fieldErrors.note;

    function submit() {
        if (take.isPending) return;
        if (amountError || dayError || noteError) return errors.tried();
        take.mutate({ amountUsd: amount!, takenOn: day, note: note.trim() || null }, {
            onSuccess: (saved) => {
                toast({ text: `${usd(saved.amountUsd)} supervision taken`, sub: `${fmtDateY(saved.takenOn)} · ${project.title}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal surfaceId="supervision_taken" size="md" title="Record supervision taken" sub={project.title} onClose={take.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {take.error && !fieldRefused ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(take.error)}</span> : null}
                    </div>
                    <button className="btn" disabled={take.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={take.isPending} onClick={submit}><Icon name="check" />{take.isPending ? "Saving…" : "Record"}</button>
                </>
            }>
            <div className="grid g-2">
                <div className="field">
                    <label className="label required" htmlFor="sup-amount">Amount taken</label>
                    <AmountField id="sup-amount" currencies={false} value={amount} onChange={(v) => { edited(); setAmount(v); }} onBlur={errors.touch("amount")} />
                    <FieldError message={errors.show("amount", amountError) ?? refused.fieldErrors.amountUsd} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="sup-day">Day taken</label>
                    <DateInput id="sup-day" className="input mono" value={day} max={today} onChange={(v) => { edited(); setDay(v); }} />
                    <FieldError message={errors.show("day", dayError) ?? refused.fieldErrors.takenOn} />
                </div>
            </div>
            <div className="field mt">
                <label className="label" htmlFor="sup-note">Note</label>
                <AutoGrowTextarea id="sup-note" className="input" minRows={2} maxRows={8} maxLength={SUPERVISION_NOTE_MAX} value={note}
                    placeholder="Optional - e.g. First instalment, paid to the company account." onChange={(e) => { edited(); setNote(e.target.value); }} onBlur={errors.touch("note")} />
                <FieldError message={errors.show("note", noteError) ?? refused.fieldErrors.note} />
            </div>
            <p className="hint mt">
                It lowers the cash in the account and what is left to take. It is not a cost, so the profit stays as it is. Taking more than is due is allowed and shows as over.
            </p>
        </Modal>
    );
}

/** Asks before removing: the withdrawal leaves the list and the figures, and stays in the books marked removed. */
function RemoveSupervisionModal({ project, withdrawal, onClose }: { project: Project; withdrawal: SupervisionWithdrawal; onClose: () => void }) {
    const remove = useRemoveSupervision();

    function submit() {
        if (remove.isPending) return;
        remove.mutate(withdrawal.id, {
            onSuccess: () => {
                toast({ text: "Supervision taken removed", sub: `${usd(withdrawal.amountUsd)} on ${fmtDateY(withdrawal.takenOn)} · ${project.title}`, icon: "trash" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Remove supervision taken" sub={project.title} onClose={remove.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow">{remove.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(remove.error)}</span> : null}</div>
                    <button className="btn" disabled={remove.isPending} onClick={onClose}>Keep it</button>
                    <button className="btn btn-danger" disabled={remove.isPending} onClick={submit}>{remove.isPending ? "Removing…" : "Remove"}</button>
                </>
            }>
            <p style={{ margin: 0 }}>
                Remove the <b className="mono">{usd(withdrawal.amountUsd)}</b> taken on <b>{fmtDateY(withdrawal.takenOn)}</b>?
            </p>
            <p className="hint mt-s">It no longer counts against the supervision due, and the cash in the account goes back up by it. It stays in the activity history.</p>
        </Modal>
    );
}
