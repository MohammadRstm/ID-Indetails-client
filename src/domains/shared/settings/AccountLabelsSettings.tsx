import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { FieldError } from "@/shared/components/Forms/Field";
import Icon from "@/shared/icons/Icon";
import {
    ACCOUNT_LABEL_NAME_MAX, useAccountLabels, useArchiveAccountLabel, useReorderAccountLabels, useSaveAccountLabel, type AccountLabel,
} from "../accountLabels/accountLabelsApi";
import { saved } from "./settingsToasts";

/**
 * The company's account labels (Concrete, Finishing, Permits…): one list for every business, picked on a payment or an
 * expense to say which account it belongs to. Only whoever manages the company's settings (a super admin) sees it. An
 * archived label can't be picked any more, but what already uses it keeps it; the archived ones are listed last.
 */
export default function AccountLabelsSettings() {
    const labels = useAccountLabels(true);
    const reorder = useReorderAccountLabels();
    const [adding, setAdding] = useState(false);
    const active = (labels.data ?? []).filter((l) => !l.archived);
    const archived = (labels.data ?? []).filter((l) => l.archived);

    // the order is of the labels that can be picked: the archived ones have none
    function move(index: number, by: -1 | 1) {
        const ids = active.map((l) => l.id);
        [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
        reorder.mutate(ids, { onSuccess: saved("Order saved", "Applies straight away") });
    }

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Account labels</div>
                    <div className="panel-sub">The accounts a payment or an expense is booked to. One list for every business, shown in this order.</div>
                </div>
                {!adding && <div className="panel-tools"><button className="btn btn-sm" onClick={() => setAdding(true)}><Icon name="plus" />Add label</button></div>}
            </div>
            <div className="panel-body">
                {loadFailed(labels) ? <LoadError error={labels.error} retry={() => labels.refetch()} what="the account labels" />
                    : !labels.data ? <SkeletonLines lines={4} /> : (
                        <>
                            {adding && <LabelRow label={null} onDone={() => setAdding(false)} />}
                            {active.map((l, i) => (
                                <LabelRow key={l.id} label={l}
                                    onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < active.length - 1 ? () => move(i, 1) : undefined} />
                            ))}
                            {archived.map((l) => <LabelRow key={l.id} label={l} />)}
                            {!active.length && !archived.length && !adding && <Empty art="search" title="No account labels yet" text="Add the first one: payments and expenses can then be booked to it." />}
                            {reorder.error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(reorder.error)}</div>}
                        </>
                    )}
            </div>
        </div>
    );
}

/** One label: its name, renamed in place, archived or restored and moved; or the new label being named. */
function LabelRow({ label, onUp, onDown, onDone }: {
    label: AccountLabel | null; onUp?: () => void; onDown?: () => void; onDone?: () => void;
}) {
    const save = useSaveAccountLabel();
    const archive = useArchiveAccountLabel();
    const [name, setName] = useState<string | null>(label ? null : "");
    const [touched, setTouched] = useState(false);
    const editing = name != null;
    const typed = name?.trim() ?? "";
    const nameError = (touched && !typed && "Give the label a name.")
        || (typed.length > ACCOUNT_LABEL_NAME_MAX && `At most ${ACCOUNT_LABEL_NAME_MAX} characters.`)
        || (save.error != null && errorMessage(save.error))
        || undefined;

    const stop = () => { setName(label ? null : ""); setTouched(false); save.reset(); onDone?.(); };
    function submit() {
        if (save.isPending) return;
        setTouched(true);
        if (!typed || typed.length > ACCOUNT_LABEL_NAME_MAX) return;
        save.mutate({ id: label?.id ?? null, name: typed }, {
            onSuccess: () => { saved(label ? "Label renamed" : "Label added", typed)(); setName(null); setTouched(false); onDone?.(); },
        });
    }

    return (
        <div className="switch-row">
            <div className="grow">
                {editing ? (
                    <>
                        <input className="input" autoFocus aria-label="Label name" placeholder="e.g. Concrete" value={name}
                            onChange={(e) => { setName(e.target.value); setTouched(true); save.reset(); }}
                            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") stop(); }} />
                        <FieldError message={nameError} />
                    </>
                ) : (
                    <>
                        <div style={{ fontWeight: 600, opacity: label!.archived ? 0.6 : 1 }}>{label!.name}</div>
                        {label!.archived && <p>Archived: it can't be picked any more.</p>}
                        {archive.error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(archive.error)}</div>}
                    </>
                )}
            </div>
            {editing ? (
                <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm btn-primary" disabled={save.isPending} onClick={submit}>{label ? "Save" : "Add"}</button>
                    <button className="btn btn-sm" onClick={stop}>Cancel</button>
                </div>
            ) : (
                <div className="row" style={{ gap: 6 }}>
                    {!label!.archived && (
                        <>
                            <button className="icon-btn" aria-label={`Move ${label!.name} up`} disabled={!onUp} onClick={onUp}><Icon name="chevronUp" /></button>
                            <button className="icon-btn" aria-label={`Move ${label!.name} down`} disabled={!onDown} onClick={onDown}><Icon name="chevronDown" /></button>
                        </>
                    )}
                    <button className="btn btn-sm btn-quiet" onClick={() => setName(label!.name)}>Rename</button>
                    <button className="btn btn-sm btn-quiet" disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: label!.id, archive: !label!.archived }, { onSuccess: saved(label!.archived ? "Label restored" : "Label archived", label!.name) })}>
                        {label!.archived ? "Restore" : "Archive"}
                    </button>
                </div>
            )}
        </div>
    );
}
