import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useAddOverheadGroup, useOverheadGroups, useRemoveOverheadGroup, useRenameOverheadGroup, type OverheadGroup } from "./companyApi";

const MAX = 60;

/**
 * The categories of company expenses, which only a super admin manages: a new one goes before "Other", and
 * one still used by an expense stays until its expenses move to another.
 */
export default function OverheadGroupsModal({ onClose }: { onClose: () => void }) {
    const groups = useOverheadGroups();
    const add = useAddOverheadGroup();
    const [name, setName] = useState("");
    const errors = useFormErrors();
    const nameError = !name.trim() ? "Name the category." : name.trim().length > MAX && `At most ${MAX} characters.`;

    function addOne() {
        if (add.isPending) return;
        if (nameError) return errors.tried();
        add.mutate(name.trim(), {
            onSuccess: (g) => {
                setName("");
                toast({ text: `${g.name} added`, sub: "It is offered when adding or editing an expense.", icon: "checkCircle" });
            },
        });
    }

    return (
        <Modal title="Expense categories" sub="How company expenses are grouped. Only a super admin changes them." onClose={onClose}
            foot={<><div className="grow muted">"Other" is always listed last.</div><button className="btn" onClick={onClose}>Done</button></>}>
            {loadFailed(groups) ? <LoadError error={groups.error} retry={() => groups.refetch()} what="the categories" />
                : !groups.data ? <SkeletonLines lines={6} /> : (
                    <div className="stack" style={{ gap: 0 }}>
                        {groups.data.map((g) => <GroupRow key={g.id} group={g} />)}
                    </div>
                )}
            <div className="field mt">
                <label className="label required" htmlFor="og-new">New category</label>
                <div className="row" style={{ gap: 8 }}>
                    <input id="og-new" className="input grow" placeholder="e.g. Cleaning" maxLength={MAX + 10} value={name}
                        onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")}
                        onKeyDown={(e) => { if (e.key === "Enter") addOne(); }} />
                    <button className="btn btn-primary" disabled={add.isPending} onClick={addOne}><Icon name="plus" />Add</button>
                </div>
                {add.error ? <FieldError message={errorMessage(add.error)} /> : <FieldError message={errors.show("name", nameError)} />}
            </div>
        </Modal>
    );
}

/** One category: renamed in place, removed when no expense uses it. */
function GroupRow({ group: g }: { group: OverheadGroup }) {
    const rename = useRenameOverheadGroup();
    const remove = useRemoveOverheadGroup();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(g.name);
    const used = g.lines > 0;
    const nameError = !name.trim() ? "Name the category." : name.trim().length > MAX && `At most ${MAX} characters.`;

    function save() {
        if (nameError || rename.isPending) return;
        if (name.trim() === g.name) { setEditing(false); return; }
        rename.mutate({ id: g.id, name: name.trim() }, { onSuccess: () => setEditing(false) });
    }

    return (
        <div className="switch-row" style={{ alignItems: "center" }}>
            {editing ? (
                <div className="grow">
                    <input className="input" autoFocus aria-label={`New name for ${g.name}`} value={name} onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(g.name); setEditing(false); } }} />
                    <FieldError message={rename.error ? errorMessage(rename.error) : nameError || undefined} />
                </div>
            ) : (
                <div className="grow">
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <p>{used ? plural(g.lines, "expense") : "Not used yet"}</p>
                </div>
            )}
            {editing ? (
                <>
                    <button className="btn btn-sm" onClick={() => { setName(g.name); setEditing(false); }}>Cancel</button>
                    <button className="btn btn-sm btn-primary" disabled={rename.isPending} onClick={save}>Save</button>
                </>
            ) : (
                <>
                    <button className="icon-btn" aria-label={`Rename ${g.name}`} title="Rename" onClick={() => setEditing(true)}><Icon name="edit" /></button>
                    <button className="icon-btn" aria-label={`Remove ${g.name}`} disabled={used || remove.isPending}
                        title={used ? "Used by expenses: move them to another category first" : "Remove"}
                        onClick={() => remove.mutate(g.id, {
                            onSuccess: () => toast({ text: `${g.name} removed`, icon: "trash" }),
                            onError: (e) => toast({ text: `${g.name} wasn't removed`, sub: errorMessage(e), icon: "alert" }),
                        })}>
                        <Icon name="trash" />
                    </button>
                </>
            )}
        </div>
    );
}
