import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { useDomain } from "@/app/routing/domainContext";
import { ProjectTile } from "@/shared/components/Data/Bits";
import Panel, { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import TimeField from "@/shared/components/Forms/TimeField";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import {
    companyTimeToUtc, companyToday, DAYS, dayKey, fmtDayDate, fmtDur, fmtRange, fmtTime, MONTHS, minutesOfDay, partsOf,
} from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useProjects } from "../projects/projectsApi";
import { meetingTitle, useCanChangeMeeting, useCreateMeeting, useDeleteMeeting, useMeetings, useProjectMeetings, type Meeting } from "./meetingsApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

function RemoveMenu({ meeting }: { meeting: Meeting }) {
    const remove = useDeleteMeeting();
    return (
        <MenuButton icon="dots" label="Meeting actions" width={170}>
            {(close) => (
                <div>
                    <button className="pop-item" onClick={() => {
                        close();
                        remove.mutate({ id: meeting.id, projectId: meeting.project.id }, {
                            onSuccess: () => toast({ text: "Meeting removed", sub: `${meeting.topic || meetingTitle(meeting)} · ${fmtDayDate(meeting.startsAt)}`, icon: "trash" }),
                            onError: (e) => toast({ text: "The meeting wasn't removed", sub: errorMessage(e), icon: "alert" }),
                        });
                    }}><Icon name="trash" />Remove</button>
                </div>
            )}
        </MenuButton>
    );
}

type MeetingModalProps = {
    domain: string;
    /** Fixed to this project; otherwise the person picks one. */
    project?: { id: number; title: string };
    projectId?: number | null;
    onClose: () => void;
};

/** A new meeting: project, day, start and end, and an optional topic and description (the prototype's MeetingModal). */
export function MeetingModal({ domain, project, projectId: initialProject, onClose }: MeetingModalProps) {
    const permissions = usePermissions();
    const create = useCreateMeeting();
    const open = useProjects({ domain, pageSize: 100, sort: "activity" });
    const choices = (open.data?.items ?? []).filter((p) => p.status === "active" || p.status === "hold");
    const [projectId, setProjectId] = useState<string>(String(project?.id ?? initialProject ?? ""));
    const chosen = project?.id ?? (projectId ? +projectId : choices[0]?.id);
    const [day, setDay] = useState(companyToday());
    const [start, setStart] = useState(() => Math.min(23 * 60 + 30, Math.ceil(minutesOfDay(new Date()) / 30) * 30));
    const [end, setEnd] = useState(() => Math.min(23 * 60 + 59, start + 60));
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const errors = useFormErrors();
    const projectError = chosen == null && "Choose the project it is about.";
    const timeError = end <= start && "It has to end after it starts.";

    function submit() {
        if (create.isPending) return;
        if (projectError || timeError) return errors.tried();
        const startsAt = companyTimeToUtc(day, start), endsAt = companyTimeToUtc(day, end);
        create.mutate({
            projectId: chosen!,
            body: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), topic: topic.trim() || null, description: description.trim() || null },
        }, {
            onSuccess: () => {
                toast({ text: "Meeting scheduled", sub: `${fmtDayDate(day)} · ${fmtRange(startsAt, endsAt)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="New meeting" sub={project ? project.title : "Pick the project it's about"} onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {create.error ? <FieldError message={errorMessage(create.error)} />
                            : `Everyone in ${DOMAIN_LABEL[domain] ?? domain} sees it${permissions.isAdmin ? "" : "; your admin is notified"}.`}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={create.isPending} onClick={submit}>Schedule meeting</button>
                </>
            }>
            {!project && (
                <div className="field" style={{ marginBottom: 12 }}>
                    <label className="label" htmlFor="mtg-project">Project</label>
                    <Select id="mtg-project" value={String(chosen ?? "")} onChange={setProjectId}
                        options={choices.length ? choices.map((x) => ({ value: String(x.id), label: x.title })) : [{ value: "", label: open.isPending ? "Loading…" : "No open projects" }]} />
                    <FieldError message={errors.show("project", projectError)} />
                </div>
            )}
            <div className="grid g-2">
                <div className="field">
                    <label className="label" htmlFor="mtg-date">Date</label>
                    <DateInput id="mtg-date" className="input mono" value={day} required onChange={(v) => v && setDay(v)} />
                </div>
                <div className="field">
                    <label className="label">Time</label>
                    <div className="row" style={{ gap: 6 }}>
                        <div style={{ flex: 1 }}><TimeField value={start} label="Start" onChange={(m) => { setStart(m); if (end <= m) setEnd(m + 60); }} /></div>
                        <span className="muted">–</span>
                        <div style={{ flex: 1 }}><TimeField value={end} label="End" min={start} onChange={setEnd} /></div>
                    </div>
                    {/* the end follows the start, so this is said at once */}
                    <FieldError message={timeError || undefined} />
                </div>
            </div>
            <div className="field mt">
                <label className="label" htmlFor="mtg-topic">Topic</label>
                <input id="mtg-topic" className="input" placeholder="Optional" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="field mt">
                <label className="label" htmlFor="mtg-desc">Description</label>
                <textarea id="mtg-desc" className="textarea" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
        </Modal>
    );
}

/** A project's Meetings tab (the prototype's P.ProjectMeetings). */
export function ProjectMeetingsTab({ project }: { project: { id: number; title: string; domain: string } }) {
    const permissions = usePermissions();
    const canRemove = useCanChangeMeeting();
    const query = useProjectMeetings(project.id);
    const [showNew, setShowNew] = useState(false);
    const list = [...(query.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const canCreate = permissions.hasAny(P.MEETING_CREATE, P.MEETING_MANAGE);

    return (
        <div>
            <Panel className="mt" title="Meetings"
                sub={project.domain === "execution"
                    ? "Every meeting set for this project, and who set it. Anyone on the project can add one."
                    : "Schedule a meeting for this project. Once its time is set, it shows up on the Timeline alongside the work logged that day."}
                tools={canCreate && <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>}>
                {query.isPending ? <SkeletonLines lines={3} />
                    : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the meetings" />
                        : !list.length ? (
                            <Empty art="time" title="No meetings scheduled yet" text="Meetings you add will appear here, and as a red block on the project's Timeline."
                                action={canCreate && <button className="btn" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>} />
                        ) : list.map((m) => (
                            <div key={m.id} className="row start" style={{ gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                                <Icon name="calendar" style={{ width: 18, height: 18, flex: "none", marginTop: 2, color: "var(--now)" }} />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div className="row wrap" style={{ gap: 8 }}>
                                        <b>{meetingTitle(m)}</b>
                                        <span className="mono muted" style={{ fontSize: "11.5px" }}>{fmtRange(m.startsAt, m.endsAt)}</span>
                                    </div>
                                    {m.topic && <div className="sec" style={{ marginTop: 2 }}>{m.topic}</div>}
                                    {m.description && <div className="muted clamp2" style={{ marginTop: 2, fontSize: 12 }}>{m.description}</div>}
                                    {m.createdBy && <div className="muted" style={{ marginTop: 2, fontSize: "11.5px" }}>Set by <PersonName person={m.createdBy} /></div>}
                                </div>
                                {canRemove(m) && <RemoveMenu meeting={m} />}
                            </div>
                        ))}
            </Panel>
            {showNew && <MeetingModal domain={project.domain} project={project} onClose={() => setShowNew(false)} />}
        </div>
    );
}

/** Every meeting in the domain, upcoming first (the prototype's P.Meetings). */
export function MeetingsPage() {
    const domain = useDomain();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    const canRemove = useCanChangeMeeting();
    const [projectId, setProjectId] = useState("all");
    const [mine, setMine] = useState(false);
    const [showPast, setShowPast] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const all = useMeetings({ domain });
    const query = useMeetings({ domain, projectId: projectId === "all" ? undefined : +projectId, mine });
    const now = new Date().toISOString();
    const list = query.data ?? [];
    const upcoming = list.filter((m) => m.endsAt >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = list.filter((m) => m.endsAt < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const projects = [...new Map((all.data ?? []).map((m) => [m.project.id, m.project])).values()].sort((a, b) => a.title.localeCompare(b.title));
    const next = upcoming[0];
    const canCreate = permissions.hasAny(P.MEETING_CREATE, P.MEETING_MANAGE);

    function Row(m: Meeting) {
        const p = partsOf(m.startsAt);
        const today = dayKey(m.startsAt) === companyToday();
        const live = m.startsAt <= now && m.endsAt >= now;
        const route = `/${domain}/projects/${m.project.id}${permissions.isAdmin ? "?tab=meetings" : ""}`;
        return (
            <div key={m.id} className={cx("mtg-row", live && "live-now")}>
                <div className="mtg-date"><span>{MONTHS[p.month]}</span><b>{p.day}</b><span>{DAYS[p.weekday]}</span></div>
                <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                        <b className="mono">{fmtRange(m.startsAt, m.endsAt)}</b>
                        <span className="muted mono" style={{ fontSize: "11.5px" }}>{fmtDur(m.minutes)}</span>
                        {live ? <span className="badge badge-live">Happening now</span> : today ? <span className="badge">Today</span> : null}
                    </div>
                    <div className="mtg-topic">{m.topic || meetingTitle(m)}</div>
                    {m.description && <div className="muted clamp2" style={{ fontSize: 12, marginTop: 2 }}>{m.description}</div>}
                    <div className="row wrap muted" style={{ gap: "6px 12px", fontSize: "11.5px", marginTop: 5 }}>
                        <span className="row link-quiet" style={{ gap: 6, cursor: "pointer" }} {...clickable(() => navigate(route), "link")}>
                            <ProjectTile icon={m.project.icon} tint={m.project.tint} size="sm" />{m.project.title}
                        </span>
                        {m.createdBy && (
                            <span className="row" style={{ gap: 5 }}>
                                <PersonAvatar person={m.createdBy} size={16} />Set by {m.createdBy.id === me ? "you" : <PersonName person={m.createdBy} />}
                            </span>
                        )}
                    </div>
                </div>
                {canRemove(m) && <RemoveMenu meeting={m} />}
            </div>
        );
    }

    return (
        <div className="page">
            <PageHead
                title="Meetings"
                sub={`${next ? `Next: ${next.topic || "meeting"} · ${fmtDayDate(next.startsAt)}, ${fmtTime(next.startsAt)}` : query.isPending ? "…" : "Nothing scheduled"} · anyone in ${DOMAIN_LABEL[domain]} can set a meeting`}
                actions={canCreate && <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>}
            />

            <div className="filters">
                <Select className="select sm" style={{ width: 220 }} aria-label="Project" value={projectId} onChange={setProjectId}
                    options={[{ value: "all", label: "All projects" }, ...projects.map((x) => ({ value: String(x.id), label: x.title }))]} />
                <button className={cx("chip", mine && "on")} onClick={() => setMine(!mine)}><Icon name="user" />Set by me</button>
            </div>

            <Panel className="mt" title="Upcoming" sub={`${upcoming.length} meeting${upcoming.length === 1 ? "" : "s"}`} bodyStyle={{ paddingTop: 2 }}>
                {query.isPending ? <SkeletonLines lines={4} />
                    : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the meetings" />
                        : upcoming.length ? upcoming.map(Row) : (
                            <Empty art="time" title="No meetings coming up"
                                text="Schedule one for any project in your business - it shows up here for everyone, and on the project's Timeline."
                                action={canCreate && <button className="btn" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>} />
                        )}
            </Panel>

            {past.length > 0 && (
                <Panel className="mt" title="Earlier" sub={`${past.length} meeting${past.length === 1 ? "" : "s"} that already happened`}
                    tools={<button className="btn btn-sm btn-quiet" onClick={() => setShowPast(!showPast)}><Icon name={showPast ? "chevronUp" : "chevronDown"} />{showPast ? "Hide" : "Show"}</button>}
                    bodyStyle={{ paddingTop: 2 }}>
                    {showPast ? past.map(Row) : undefined}
                </Panel>
            )}

            {showNew && <MeetingModal domain={domain} projectId={projectId !== "all" ? +projectId : null} onClose={() => setShowNew(false)} />}
        </div>
    );
}
