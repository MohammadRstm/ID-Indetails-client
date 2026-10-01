import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { Bar } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import Panel from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import { Avatars, PersonName } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import Popover from "@/shared/components/Overlays/Popover";
import { companyToday, daysBetween, fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { personName, useDomainPeople } from "../people/peopleApi";
import {
    useAddRequirement, useDeleteRequirement, useRequirements, useTickRequirement, useUpdateRequirement,
    type Requirement, type SaveRequirementBody,
} from "./requirementsApi";
import { loadFailed } from "@/api/queryState";

type Person = { id: number; name: string };

/** "Hana, Sarah": first names, each opening that person's profile. */
export function NameList({ people }: { people: Person[] }) {
    return (
        <span>
            {people.map((p, i) => (
                <span key={p.id}>{i > 0 && ", "}<PersonName person={p} text={p.name.split(" ")[0]} /></span>
            ))}
        </span>
    );
}

/** A requirement's deadline, red once overdue and amber within the week. */
export function DeadlineTag({ deadline, done }: { deadline: string | null; done: boolean }) {
    if (!deadline) return null;
    const days = daysBetween(companyToday(), deadline);
    const overdue = !done && days < 0;
    const soon = !done && !overdue && days <= 7;
    return (
        <span className={cx("req-due", overdue && "overdue", soon && "soon")}>
            <Icon name="calendar" />{overdue ? "Overdue · " : "Due "}{fmtDate(deadline)}{soon ? ` · ${days === 0 ? "today" : `${days}d`}` : ""}
        </span>
    );
}

function AssigneePicker({ value, onChange, options }: { value: number[]; onChange: (ids: number[]) => void; options: (Person & { team?: string | null })[] }) {
    const [q, setQ] = useState("");
    const shown = options.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
    const chosen = options.filter((x) => value.includes(x.id));
    const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    return (
        <Popover width={260} trigger={(open, t) => (
            <button type="button" className={cx("input req-pick", open && "on")} onClick={t}>
                {chosen.length ? (
                    <>
                        <Avatars people={chosen} max={4} size={18} />
                        <span className="trunc">{chosen.length === 1 ? chosen[0].name : `${chosen.length} people`}</span>
                    </>
                ) : <span className="muted">Not assigned</span>}
                <span className="grow" /><Icon name="chevronDown" />
            </button>
        )}>
            <div>
                <div className="search" style={{ margin: "2px 2px 6px" }}>
                    <Icon name="search" />
                    <input className="input" placeholder="Search employees" aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="req-pick-list">
                    {shown.map((x) => (
                        <button key={x.id} type="button" className={cx("pop-item", value.includes(x.id) && "on")} onClick={() => toggle(x.id)}>
                            <Avatars people={[x]} size={20} />
                            <span className="grow trunc">{x.name}{x.team && <span className="muted" style={{ fontSize: 11 }}> · {x.team}</span>}</span>
                            {value.includes(x.id) && <Icon name="check" className="chk" />}
                        </button>
                    ))}
                    {!shown.length && <div className="muted" style={{ padding: 8, fontSize: 12 }}>No employees match.</div>}
                </div>
                {value.length > 0 && (
                    <button type="button" className="btn btn-sm btn-quiet btn-block" style={{ marginTop: 4 }} onClick={() => onChange([])}>Clear - not assigned</button>
                )}
            </div>
        </Popover>
    );
}

/** Who a requirement may be assigned to: the domain's employees (not admins), active or invited. */
function useAssignable(domain: string, enabled: boolean) {
    const people = useDomainPeople(domain, enabled, { role: "employee" });
    return (people.data ?? [])
        .filter((p) => p.status !== "deactivated")
        .map((p) => ({ id: p.id, name: personName(p), team: p.team?.name ?? null, photoFileId: p.photoFileId }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

type ReqFormProps = {
    domain: string;
    requirement?: Requirement;
    busy?: boolean;
    error?: unknown;
    onSubmit: (body: SaveRequirementBody) => Promise<unknown>;
    onCancel?: () => void;
};

function ReqForm({ domain, requirement, busy, error, onSubmit, onCancel }: ReqFormProps) {
    const permissions = usePermissions();
    const options = useAssignable(domain, permissions.has(P.EMPLOYEE_VIEW));
    const [text, setText] = useState(requirement?.text ?? "");
    const [who, setWho] = useState<number[]>(requirement?.assignees.map((a) => a.id) ?? []);
    const [due, setDue] = useState(requirement?.deadline ?? "");

    async function submit() {
        if (!text.trim()) return;
        try {
            await onSubmit({ text: text.trim(), assigneeIds: who, deadline: due || null });
            if (!requirement) { setText(""); setWho([]); setDue(""); }
        } catch {
            // Shown under the form.
        }
    }

    return (
        <div className="req-form">
            <textarea className="textarea" rows={2} placeholder={`What has to be achieved? e.g. ${domain === "execution" ? "Kitchen tiling finished and inspected" : "Concept design approved by the client"}`}
                aria-label="Requirement" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="req-form-row">
                <div className="req-field"><span className="label optional">Assigned to</span><AssigneePicker value={who} onChange={setWho} options={options} /></div>
                <div className="req-field">
                    <span className="label">Deadline</span>
                    <DateInput className="input mono" value={due} placeholder="Optional" onChange={setDue} />
                </div>
                <span className="grow" />
                {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
                <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={submit}>
                    <Icon name={requirement ? "check" : "plus"} />{requirement ? "Save" : "Add requirement"}
                </button>
            </div>
            {error != null && <FieldError message={errorMessage(error)} />}
        </div>
    );
}

type ReqRowProps = {
    r: Requirement;
    me: number;
    /** Admins with requirement:manage: tick, edit and delete anything. */
    canManage: boolean;
    /** requirement:complete_own: tick your own (and untick your own ticks). */
    canTickOwn: boolean;
    onToggle: (r: Requirement, done: boolean) => void;
    onEdit?: (r: Requirement) => void;
    onDelete?: (r: Requirement) => void;
};

function ReqRow({ r, me, canManage, canTickOwn, onToggle, onEdit, onDelete }: ReqRowProps) {
    const mine = r.assignees.some((a) => a.id === me);
    const canTick = canManage || (canTickOwn && mine && (!r.isDone || r.doneBy?.id === me));
    return (
        <div className={cx("req", r.isDone && "done", mine && "mine")}>
            {canTick
                ? <input type="checkbox" className="req-check" checked={r.isDone} aria-label="Done" onChange={(e) => onToggle(r, e.target.checked)} />
                : <span className={cx("req-dot", r.isDone && "on")}>{r.isDone && <Icon name="check" />}</span>}
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="req-text">{r.text}</div>
                <div className="req-meta">
                    {r.assignees.length
                        ? <span className="row" style={{ gap: 5 }}><Avatars people={r.assignees} max={4} size={16} link /><NameList people={r.assignees} /></span>
                        : <span className="muted">Not assigned</span>}
                    {mine && <span className="badge badge-new">Assigned to you</span>}
                    <DeadlineTag deadline={r.deadline} done={r.isDone} />
                    {r.isDone && r.doneAt && (
                        <span className="muted">Done {fmtDate(r.doneAt)}{r.doneBy ? ` · ${r.doneBy.name.split(" ")[0]}` : ""}{r.autoDone ? " · when the project was completed" : ""}</span>
                    )}
                </div>
            </div>
            {canManage && onEdit && onDelete && (
                <MenuButton icon="dots" label="Requirement actions" width={160}>
                    {(close) => (
                        <div>
                            <button className="pop-item" onClick={() => { close(); onEdit(r); }}><Icon name="edit" />Edit</button>
                            <button className="pop-item" onClick={() => { close(); onDelete(r); }}><Icon name="trash" />Delete</button>
                        </div>
                    )}
                </MenuButton>
            )}
        </div>
    );
}

function ReqList(props: Omit<ReqRowProps, "r"> & { list: Requirement[] }) {
    const { list, ...row } = props;
    const open = list.filter((r) => !r.isDone), done = list.filter((r) => r.isDone);
    return (
        <div>
            {open.length > 0 && <><div className="u req-group">Open · {open.length}</div>{open.map((r) => <ReqRow key={r.id} r={r} {...row} />)}</>}
            {done.length > 0 && <><div className="u req-group">Done · {done.length}</div>{done.map((r) => <ReqRow key={r.id} r={r} {...row} />)}</>}
        </div>
    );
}

/** Open first (oldest first), then done (latest first), as in the prototype. */
function ordered(items: Requirement[]): Requirement[] {
    return [...items].sort((a, b) =>
        Number(a.isDone) - Number(b.isDone)
        || (a.isDone ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : a.createdAt.localeCompare(b.createdAt)));
}

/** A project's Requirements tab, for admins (the prototype's P.ProjectRequirements). */
export function ProjectRequirementsTab({ project }: { project: { id: number; domain: string; status: string } }) {
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    const query = useRequirements(project.id);
    const add = useAddRequirement(project.id);
    const update = useUpdateRequirement(project.id);
    const tick = useTickRequirement(project.id);
    const remove = useDeleteRequirement(project.id);
    const [editing, setEditing] = useState<Requirement | null>(null);
    const [show, setShow] = useState<"all" | "open" | "done">("all");
    const locked = project.status === "completed" || project.status === "archived";
    const canManage = permissions.has(P.REQUIREMENT_MANAGE) && !locked;

    const data = query.data;
    const list = ordered(data?.items ?? []);
    const open = list.filter((r) => !r.isDone).length;
    const shown = show === "open" ? list.filter((r) => !r.isDone) : show === "done" ? list.filter((r) => r.isDone) : list;

    function onToggle(r: Requirement, done: boolean) {
        tick.mutate({ id: r.id, done }, {
            onSuccess: () => toast({ text: done ? "Requirement done" : "Requirement reopened", icon: "checkCircle" }),
            onError: (e) => toast({ text: "That didn't save", sub: errorMessage(e), icon: "alert" }),
        });
    }
    function onDelete(r: Requirement) {
        remove.mutate(r.id, {
            onSuccess: () => toast({ text: "Requirement deleted", icon: "trash" }),
            onError: (e) => toast({ text: "That didn't delete", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div>
            <div className="kpis">
                <Kpi label="Progress" value={data ? `${data.progressPct}%` : "-"} sub={<div style={{ width: 88 }}><Bar value={data?.progressPct ?? 0} hideValue /></div>} />
                <Kpi label="Requirements done" value={data ? `${data.done} of ${data.total}` : "-"} sub={<span>progress = done ÷ total</span>} />
                <Kpi label="Still open" value={data ? open : "-"} />
                <Kpi label="Overdue" value={data?.overdue ?? "-"} sub={<span className={data?.overdue ? "down" : "muted"}>{data?.overdue ? "past their deadline" : "nothing late"}</span>} />
            </div>

            {locked ? (
                <div className="banner done mt" style={{ marginBottom: 0 }}>
                    <Icon name="checkCircle" />
                    <div className="grow">This project is {project.status}. Its requirements are kept as they were closed - reopen the project to change them.</div>
                </div>
            ) : canManage && (
                <Panel className="mt" title="Add a requirement"
                    sub="Something that has to be achieved for this project to be done. Assign it to employees of this business, or leave it open.">
                    <ReqForm domain={project.domain} busy={add.isPending} error={add.error}
                        onSubmit={(body) => add.mutateAsync(body).then(() => toast({
                            text: `Requirement added${body.assigneeIds.length ? ` · ${body.assigneeIds.length} notified` : ""}`, icon: "checkCircle",
                        }))} />
                </Panel>
            )}

            <Panel className="mt" bodyStyle={{ paddingTop: 2 }} title="Requirements" sub="Tick one when it is achieved - the project's progress follows."
                tools={data && (
                    <Segmented value={show} onChange={setShow} options={[
                        { value: "all", label: `All ${data.total}` }, { value: "open", label: `Open ${open}` }, { value: "done", label: `Done ${data.done}` },
                    ]} />
                )}>
                {query.isPending ? <SkeletonLines lines={4} />
                        : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the requirements" />
                            : shown.length ? (
                                <ReqList list={shown} me={me} canManage={canManage} canTickOwn={permissions.has(P.REQUIREMENT_COMPLETE_OWN) && !locked}
                                    onToggle={onToggle} onEdit={setEditing} onDelete={onDelete} />
                            ) : (
                                <Empty art="done" title={data?.total ? "Nothing here" : "No requirements yet"}
                                    text={data?.total ? "Try another filter." : "Add what this project has to achieve. Progress is worked out from how many are done."} />
                            )}
            </Panel>

            {editing && (
                <Modal title="Edit requirement" onClose={() => setEditing(null)}>
                    <ReqForm domain={project.domain} requirement={editing} busy={update.isPending} error={update.error} onCancel={() => setEditing(null)}
                        onSubmit={(body) => update.mutateAsync({ id: editing.id, body }).then(() => {
                            setEditing(null);
                            toast({ text: "Requirement updated", icon: "checkCircle" });
                        })} />
                </Modal>
            )}
        </div>
    );
}

/** An employee's view of a project's requirements: their own marked, and tickable where the API lets them. */
export function RequirementsPanel({ project }: { project: { id: number; status: string } }) {
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    const query = useRequirements(project.id);
    const tick = useTickRequirement(project.id);
    const locked = project.status === "completed" || project.status === "archived";
    const list = ordered(query.data?.items ?? []);
    const mineOpen = list.filter((r) => !r.isDone && r.assignees.some((a) => a.id === me)).length;

    return (
        <Panel title="Requirements" sub={query.data
            ? `${query.data.done} of ${query.data.total} done · the project's progress is worked out from these${mineOpen ? ` · ${mineOpen} open assigned to you` : ""}`
            : " "} bodyStyle={{ paddingTop: 2 }}>
                {query.isPending ? <SkeletonLines lines={3} />
                    : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the requirements" />
                        : list.length ? (
                            <ReqList list={list} me={me} canManage={false} canTickOwn={permissions.has(P.REQUIREMENT_COMPLETE_OWN) && !locked}
                                onToggle={(r, done) => tick.mutate({ id: r.id, done }, {
                                    onSuccess: () => toast({ text: done ? "Requirement done" : "Requirement reopened", icon: "checkCircle" }),
                                    onError: (e) => toast({ text: "That didn't save", sub: errorMessage(e), icon: "alert" }),
                                })} />
                        ) : <div className="muted" style={{ fontSize: "12.5px", padding: "6px 0" }}>No requirements have been added to this project yet.</div>}
        </Panel>
    );
}
