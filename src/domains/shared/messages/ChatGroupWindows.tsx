import { useRef, useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { AREAS } from "@/app/routing/areas";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import PhotoPositioner from "@/shared/components/Forms/PhotoPositioner";
import { PersonAvatar } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { uploadFile } from "@/shared/files/upload";
import { plural } from "@/shared/format/labels";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ChatGroupTile } from "./GroupTile";
import {
    useAddGroupMembers, useCreateGroup, useDeleteGroup, useGroupCandidates, useLeaveGroup, useManagedGroups, useRemoveGroupMember,
    useRenameGroup, useSetGroupPhoto, type ChatGroupDetail, type Contact,
} from "./messagesApi";

const MAX_NAME = 80;

/** The API's limit on a group's name, said as the form says it. */
const nameProblem = (name: string) => (!name.trim() ? "Give the group a name." : name.trim().length > MAX_NAME ? `At most ${MAX_NAME} characters.` : undefined);

/** Who can be picked, by business: super admins (no business) first as "Company", then each business. */
function byBusiness(people: Contact[]): { label: string; people: Contact[] }[] {
    const order = ["", "design", "execution", "website"];
    const groups = new Map<string, Contact[]>();
    for (const p of people) groups.set(p.domain ?? "", [...(groups.get(p.domain ?? "") ?? []), p]);
    return [...groups.entries()]
        .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
        .map(([domain, list]) => ({
            label: domain ? AREAS[domain as "design"]?.label ?? domain : "Company",
            people: [...list].sort((x, y) => x.name.localeCompare(y.name)),
        }));
}

/** Everyone who can be put in a group, by business, with a search box; a click picks or unpicks someone. */
function StaffPicker({ people, value, onChange, label }: { people: Contact[]; value: number[]; onChange: (ids: number[]) => void; label: string }) {
    const [q, setQ] = useState("");
    const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q.trim().toLowerCase()));
    const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    return (
        <div>
            <div className="search" style={{ margin: "0 0 6px" }}>
                <Icon name="search" />
                <input className="input" placeholder="Search staff" aria-label={label} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="req-pick-list" role="group" aria-label={label}>
                {byBusiness(shown).map((g) => (
                    <div key={g.label}>
                        <div className="msg-sub-label">{g.label}<span>{g.people.length}</span></div>
                        {g.people.map((p) => (
                            <button key={p.id} type="button" className={cx("pop-item", value.includes(p.id) && "on")} aria-pressed={value.includes(p.id)} onClick={() => toggle(p.id)}>
                                <PersonAvatar person={{ id: p.id, name: p.name, photoFileId: p.photoFileId, domain: p.domain }} size={20} />
                                <span className="grow trunc">{p.name}{p.position && <span className="muted" style={{ fontSize: 11 }}> · {p.position}</span>}</span>
                                {value.includes(p.id) && <Icon name="check" className="chk" />}
                            </button>
                        ))}
                    </div>
                ))}
                {!shown.length && <div className="muted" style={{ padding: 8, fontSize: 12 }}>No one matches.</div>}
            </div>
        </div>
    );
}

/** A new custom group: its name and who is in it, from any business. Whoever makes it is in it too. */
export function NewGroupModal({ meId, onClose, onCreated }: { meId: number; onClose: () => void; onCreated: (groupId: number) => void }) {
    const candidates = useGroupCandidates();
    const create = useCreateGroup();
    const [name, setName] = useState("");
    const [memberIds, setMemberIds] = useState<number[]>([]);
    const errors = useFormErrors();
    const failed = create.error ? toApiError(create.error) : null;
    const nameError = failed?.fieldErrors.name ?? errors.show("name", nameProblem(name));
    const membersError = failed?.fieldErrors.memberIds;
    const formError = failed && !failed.fieldErrors.name && !failed.fieldErrors.memberIds ? errorMessage(create.error) : undefined;

    function save() {
        if (create.isPending) return;
        if (nameProblem(name)) return errors.tried();
        create.mutate({ name: name.trim(), memberIds }, {
            onSuccess: (g) => {
                toast({ text: `${g.name} created`, sub: plural(g.members.length, "person", "people"), icon: "checkCircle" });
                onCreated(g.id);
            },
        });
    }

    return (
        <Modal title="New group" sub="A chat of whoever you pick, from any business. You're in it too." onClose={onClose}
            foot={<><div className="grow muted">{memberIds.length ? plural(memberIds.length, "person", "people") + " picked" : "No one picked yet"}</div>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={create.isPending} onClick={save}>{create.isPending ? "Creating…" : "Create group"}</button></>}>
            <div className="field">
                <label className="label required" htmlFor="group-name">Name</label>
                <input id="group-name" className="input" autoFocus placeholder="e.g. Site leads" maxLength={MAX_NAME + 10} value={name}
                    onChange={(e) => { setName(e.target.value); create.reset(); }} onBlur={errors.touch("name")} />
                <FieldError message={nameError} />
            </div>
            <div className="field">
                <span className="label">People</span>
                {loadFailed(candidates) ? <LoadError error={candidates.error} retry={() => candidates.refetch()} what="the staff" />
                    : !candidates.data ? <SkeletonLines lines={5} />
                        : <StaffPicker label="People to put in the group" people={candidates.data.filter((p) => p.id !== meId)} value={memberIds}
                            onChange={(ids) => { setMemberIds(ids); create.reset(); }} />}
                <FieldError message={membersError} />
            </div>
            <FieldError message={formError} />
        </Modal>
    );
}

/**
 * Managing a custom group (message:manage_groups): its name, its photo, who is in it, and deleting it with its whole
 * history, after saying so.
 */
export function ManageGroupModal({ groupId, onClose, onDeleted }: { groupId: number; onClose: () => void; onDeleted: () => void }) {
    const groups = useManagedGroups();
    const group = groups.data?.find((g) => g.id === groupId);
    return (
        <Modal title={group ? `Manage ${group.name}` : "Manage group"} sub="Changes show in the chat as a grey line, for everyone in it." onClose={onClose}
            foot={<><div className="grow" /><button className="btn" onClick={onClose}>Done</button></>}>
            {loadFailed(groups) ? <LoadError error={groups.error} retry={() => groups.refetch()} what="the group" />
                : !groups.data ? <SkeletonLines lines={6} />
                    : !group ? <p className="muted">This group no longer exists.</p>
                        : <ManageGroup group={group} onDeleted={onDeleted} />}
        </Modal>
    );
}

function ManageGroup({ group, onDeleted }: { group: ChatGroupDetail; onDeleted: () => void }) {
    const rename = useRenameGroup(group.id);
    const add = useAddGroupMembers(group.id);
    const remove = useRemoveGroupMember(group.id);
    const candidates = useGroupCandidates();
    const [name, setName] = useState(group.name);
    const [adding, setAdding] = useState<number[]>([]);
    const [deleting, setDeleting] = useState(false);
    const errors = useFormErrors();
    const nameError = (rename.error ? toApiError(rename.error).fieldErrors.name ?? errorMessage(rename.error) : undefined) ?? errors.show("name", nameProblem(name));
    const inGroup = new Set(group.members.map((m) => m.id));

    function saveName() {
        if (rename.isPending) return;
        if (nameProblem(name)) return errors.tried();
        if (name.trim() === group.name) return;
        rename.mutate(name.trim(), { onSuccess: (g) => toast({ text: "Group renamed", sub: g.name, icon: "checkCircle" }) });
    }

    function addPicked() {
        if (!adding.length || add.isPending) return;
        add.mutate(adding, {
            onSuccess: () => {
                toast({ text: `${plural(adding.length, "person", "people")} added`, sub: group.name, icon: "checkCircle" });
                setAdding([]);
            },
        });
    }

    return (
        <>
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <GroupPhoto group={group} />
                <div className="field grow" style={{ marginTop: 0 }}>
                    <label className="label required" htmlFor="group-rename">Name</label>
                    <div className="row" style={{ gap: 8 }}>
                        <input id="group-rename" className="input grow" maxLength={MAX_NAME + 10} value={name}
                            onChange={(e) => { setName(e.target.value); rename.reset(); }} onBlur={errors.touch("name")}
                            onKeyDown={(e) => { if (e.key === "Enter") saveName(); }} />
                        <button className="btn" disabled={rename.isPending || name.trim() === group.name} onClick={saveName}>Rename</button>
                    </div>
                    <FieldError message={nameError} />
                </div>
            </div>

            <div className="msg-sec-label">In the group<span className="muted"> · {group.members.length}</span></div>
            <div className="stack" style={{ gap: 0 }}>
                {group.members.map((m) => (
                    <div key={m.id} className="switch-row" style={{ alignItems: "center" }}>
                        <PersonAvatar person={{ id: m.id, name: m.name, photoFileId: m.photoFileId, domain: m.domain }} size={26} />
                        <div className="grow" style={{ minWidth: 0 }}>
                            <div className="trunc" style={{ fontWeight: 600 }}>{m.name}</div>
                            <p className="trunc">{[m.position, m.domain ? AREAS[m.domain as "design"]?.label : "Company"].filter(Boolean).join(" · ")}</p>
                        </div>
                        <button className="btn btn-sm" disabled={remove.isPending} aria-label={`Take ${m.name} out of the group`}
                            onClick={() => remove.mutate(m.id, {
                                onSuccess: () => toast({ text: `${m.name} taken out`, sub: "They no longer see the group or its messages.", icon: "checkCircle" }),
                                onError: (e) => toast({ text: `${m.name} wasn't taken out`, sub: errorMessage(e), icon: "alert" }),
                            })}>
                            Remove
                        </button>
                    </div>
                ))}
                {!group.members.length && <p className="muted">No one is in it.</p>}
            </div>

            <div className="field mt">
                <span className="label">Add people</span>
                {loadFailed(candidates) ? <LoadError error={candidates.error} retry={() => candidates.refetch()} what="the staff" />
                    : !candidates.data ? <SkeletonLines lines={4} />
                        : <StaffPicker label="People to add" people={candidates.data.filter((p) => !inGroup.has(p.id))} value={adding}
                            onChange={(ids) => { setAdding(ids); add.reset(); }} />}
                <FieldError message={add.error ? errorMessage(add.error) : undefined} />
                <button className="btn btn-primary mt" disabled={!adding.length || add.isPending} onClick={addPicked}>
                    <Icon name="plus" />{adding.length ? `Add ${plural(adding.length, "person", "people")}` : "Add"}
                </button>
            </div>

            <div className="switch-row mt" style={{ alignItems: "center" }}>
                <div className="grow">
                    <div style={{ fontWeight: 600 }}>Delete the group</div>
                    <p>Its whole history goes, for everyone in it.</p>
                </div>
                <button className="btn btn-danger" onClick={() => setDeleting(true)}><Icon name="trash" />Delete group</button>
            </div>
            {deleting && <DeleteGroupModal group={group} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
        </>
    );
}

/** The group's photo: chosen from the device and placed in its square, changed, or taken off for the people icon. */
function GroupPhoto({ group }: { group: ChatGroupDetail }) {
    const setPhoto = useSetGroupPhoto(group.id);
    const input = useRef<HTMLInputElement>(null);
    const [placing, setPlacing] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const busy = uploading || setPhoto.isPending;

    async function save(file: File) {
        setUploading(true);
        try {
            const uploaded = await uploadFile(file, { maxEdge: 480 });
            await setPhoto.mutateAsync(uploaded.id);
            toast({ text: "Photo changed", sub: group.name, icon: "checkCircle" });
        } catch (e) {
            toast({ text: "The photo wasn't changed", sub: errorMessage(e), icon: "alert" });
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="stack" style={{ gap: 6, alignItems: "center" }}>
            <ChatGroupTile photoFileId={group.photoFileId} size="lg" />
            <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => input.current?.click()}>
                {uploading ? "Uploading…" : group.photoFileId ? "Change photo" : "Add a photo"}
            </button>
            {group.photoFileId != null && (
                <button type="button" className="btn btn-sm btn-quiet" disabled={busy}
                    onClick={() => setPhoto.mutate(null, {
                        onSuccess: () => toast({ text: "Photo taken off", sub: group.name, icon: "checkCircle" }),
                        onError: (e) => toast({ text: "The photo wasn't taken off", sub: errorMessage(e), icon: "alert" }),
                    })}>
                    Take it off
                </button>
            )}
            <input ref={input} type="file" accept="image/*" hidden aria-label="Group photo file"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setPlacing(file); }} />
            {placing && (
                <PhotoPositioner file={placing} frame="square" onCancel={() => setPlacing(null)}
                    onDone={(placed) => { setPlacing(null); void save(placed); }} />
            )}
        </div>
    );
}

/** Deleting a group, said plainly first: the whole history goes, for everyone, and can't be brought back. */
function DeleteGroupModal({ group, onClose, onDeleted }: { group: ChatGroupDetail; onClose: () => void; onDeleted: () => void }) {
    const remove = useDeleteGroup(group.id);
    return (
        <Modal title={`Delete ${group.name}?`} onClose={onClose}
            foot={<><div className="grow" /><button className="btn" onClick={onClose}>Keep it</button>
                <button className="btn btn-danger" disabled={remove.isPending}
                    onClick={() => remove.mutate(undefined, {
                        onSuccess: () => { toast({ text: `${group.name} deleted`, icon: "trash" }); onDeleted(); },
                    })}>
                    {remove.isPending ? "Deleting…" : "Delete for everyone"}
                </button></>}>
            <p>The group and its whole history are deleted for everyone in it: every message, photo, video and voice message. This can't be undone.</p>
            <FieldError message={remove.error ? errorMessage(remove.error) : undefined} />
        </Modal>
    );
}

/** Leaving a group the person is in: it goes from their chats, history included. */
export function LeaveGroupModal({ group, onClose, onLeft }: { group: { id: number; name: string }; onClose: () => void; onLeft: () => void }) {
    const leave = useLeaveGroup(group.id);
    return (
        <Modal title={`Leave ${group.name}?`} onClose={onClose}
            foot={<><div className="grow" /><button className="btn" onClick={onClose}>Stay</button>
                <button className="btn btn-danger" disabled={leave.isPending}
                    onClick={() => leave.mutate(undefined, { onSuccess: () => { toast({ text: `You left ${group.name}`, icon: "checkCircle" }); onLeft(); } })}>
                    {leave.isPending ? "Leaving…" : "Leave group"}
                </button></>}>
            <p>The group and its messages go from your chats. Only a super admin can put you back.</p>
            <FieldError message={leave.error ? errorMessage(leave.error) : undefined} />
        </Modal>
    );
}

/** Every custom group, for whoever manages groups: also the ones they aren't in, whose messages they don't see. */
export function AllGroupsModal({ onClose, onManage }: { onClose: () => void; onManage: (groupId: number) => void }) {
    const groups = useManagedGroups();
    return (
        <Modal title="Chat groups" sub="Every group. You read a group's messages only when you're in it." onClose={onClose}
            foot={<><div className="grow" /><button className="btn" onClick={onClose}>Done</button></>}>
            {loadFailed(groups) ? <LoadError error={groups.error} retry={() => groups.refetch()} what="the groups" />
                : !groups.data ? <SkeletonLines lines={5} />
                    : !groups.data.length ? <p className="muted">No groups yet.</p> : (
                        <div className="stack" style={{ gap: 0 }}>
                            {groups.data.map((g) => (
                                <div key={g.id} className="switch-row" style={{ alignItems: "center" }}>
                                    <ChatGroupTile photoFileId={g.photoFileId} />
                                    <div className="grow" style={{ minWidth: 0 }}>
                                        <div className="trunc" style={{ fontWeight: 600 }}>{g.name}</div>
                                        <p>{plural(g.members.length, "person", "people")}{g.isMember ? " · You're in it" : ""}</p>
                                    </div>
                                    <button className="btn btn-sm" aria-label={`Manage ${g.name}`} onClick={() => onManage(g.id)}>Manage</button>
                                </div>
                            ))}
                        </div>
                    )}
        </Modal>
    );
}
