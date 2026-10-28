import { useState } from "react";
import { useUrlFlag } from "@/shared/hooks/useUrlFlag";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
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
import PeoplePicker from "@/shared/components/Forms/PeoplePicker";
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
import { personName, usePeople } from "../people/peopleApi";
import { useProjects } from "../projects/projectsApi";
import {
    meetingTitle, useCanChangeMeeting, useCreateGeneralMeeting, useCreateMeeting, useDeleteMeeting, useMeetings, useProjectMeetings, type Meeting,
} from "./meetingsApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillEmpty, useProtonForm } from "@/domains/shared/proton/formFill";

function RemoveMenu({ meeting }: { meeting: Meeting }) {
    const remove = useDeleteMeeting();
    return (
        <MenuButton icon="dots" label="Meeting actions" width={170}>
            {(close) => (
                <div>
                    <button className="pop-item" onClick={() => {
                        close();
                        remove.mutate({ id: meeting.id, projectId: meeting.project?.id ?? null }, {
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
    /** The business it is set in; null in the company area, where a general meeting can be for the whole company. */
    domain: Domain | null;
    /** Fixed to this project; otherwise the person picks what it is about. */
    project?: { id: number; title: string };
    projectId?: number | null;
    onClose: () => void;
};

const GENERAL = "general";

/**
 * A new meeting: what it is about, day, start and end, and an optional topic and description (the prototype's
 * MeetingModal). meeting:manage also sets general meetings, about no project and for chosen attendees; for them it is
 * the default. New meetings are about active projects only.
 */
export function MeetingModal({ domain, project, projectId: initialProject, onClose }: MeetingModalProps) {
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    const create = useCreateMeeting();
    const createGeneral = useCreateGeneralMeeting();
    const canGeneral = !project && permissions.has(P.MEETING_MANAGE);
    const domains = domain ? [domain] : permissions.visibleDomains;
    const list = (d: Domain) => ({ domain: d, status: "active" as const, pageSize: 100, sort: "activity" as const });
    const design = useProjects(list("design"), !project && domains.includes("design"));
    const execution = useProjects(list("execution"), !project && domains.includes("execution"));
    const choices = ([["design", design], ["execution", execution]] as const)
        .flatMap(([d, q]) => (q.data?.items ?? []).filter((p) => p.status === "active").map((p) => ({ id: p.id, title: p.title, domain: d })));
    const [about, setAbout] = useState(String(initialProject ?? (canGeneral ? GENERAL : "")));
    const general = canGeneral && about === GENERAL;
    const chosen = general ? undefined : project?.id ?? (about ? +about : choices[0]?.id);
    const [belongs, setBelongs] = useState("");
    const where = domain ?? ((belongs || null) as Domain | null);
    const people = usePeople({ status: "active", page: 1, pageSize: 100 }, canGeneral);
    // those who belong where the meeting does; super admins belong everywhere
    const invitable = (people.data?.items ?? [])
        .filter((x) => x.id !== me && x.status === "active" && (where == null || x.domain === where || x.role === "super_admin"))
        .map((x) => ({ id: x.id, name: personName(x), photoFileId: x.photoFileId, team: x.team?.name ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const [attendees, setAttendees] = useState<number[]>([]);
    const picked = attendees.filter((id) => invitable.some((x) => x.id === id));
    const [day, setDay] = useState(companyToday());
    const [start, setStart] = useState(() => Math.min(23 * 60 + 30, Math.ceil(minutesOfDay(new Date()) / 30) * 30));
    const [end, setEnd] = useState(() => Math.min(23 * 60 + 59, start + 60));
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const proton = useProtonForm("meeting", null, (fill) => {
        const v = fill.meeting;
        const done: string[] = [];
        if (!v) return done;
        if (v.projectId != null && !project) {
            setAbout(String(v.projectId));
            done.push("project");
        }
        if (v.day) { setDay(v.day); done.push("day"); }
        if (v.startMinute != null) { setStart(v.startMinute); done.push("start"); }
        if (v.endMinute != null) { setEnd(v.endMinute); done.push("end"); }
        fillEmpty(topic, v.topic, setTopic, "topic", done);
        fillEmpty(description, v.description, setDescription, "description", done);
        return done;
    });
    const errors = useFormErrors();
    const projectError = !general && chosen == null && "Choose the project it is about.";
    const attendeesError = general && !picked.length && "Choose who the meeting is with.";
    const timeError = end <= start && "It has to end after it starts.";
    const pending = create.isPending || createGeneral.isPending;
    const error = create.error ?? createGeneral.error;
    const seenIn = domain ?? choices.find((c) => c.id === chosen)?.domain;

    function submit() {
        if (pending) return;
        if (projectError || attendeesError || timeError) return errors.tried();
        const startsAt = companyTimeToUtc(day, start), endsAt = companyTimeToUtc(day, end);
        const body = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), topic: topic.trim() || null, description: description.trim() || null };
        const done = {
            onSuccess: () => {
                toast({ text: "Meeting scheduled", sub: `${fmtDayDate(day)} · ${fmtRange(startsAt, endsAt)}`, icon: "checkCircle" });
                onClose();
            },
        };
        if (general) createGeneral.mutate({ ...body, domain: where, attendeeIds: picked }, done);
        else create.mutate({ projectId: chosen!, body }, done);
    }

    return (
        <Modal surfaceId="new_meeting" title="New meeting" onClose={onClose}
            sub={project ? project.title : canGeneral ? "A general meeting, or one about an active project" : "Pick the project it's about"}
            foot={
                <>
                    <div className="grow">
                        {error ? <FieldError message={errorMessage(error)} />
                            : general ? "Its attendees are notified."
                                : `Everyone in ${seenIn ? DOMAIN_LABEL[seenIn] : "its business"} sees it${permissions.has(P.MEETING_MANAGE) ? "" : "; your admin is notified"}.`}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending} onClick={submit}>Schedule meeting</button>
                </>
            }>
            <div {...proton.guard}>
                <FilledNote fields={proton.filled} />
                {!project && (
                    <div className={cx(general && !domain && "grid g-2")} style={{ marginBottom: 12 }}>
                        <div className="field">
                            <label className="label required" htmlFor="mtg-about">About</label>
                            <Select id="mtg-about" value={general ? GENERAL : String(chosen ?? "")} onChange={setAbout}
                                options={[
                                    ...(canGeneral ? [{ value: GENERAL, label: "General meeting" }] : []),
                                    ...choices.map((x) => ({ value: String(x.id), label: domains.length > 1 ? `${x.title} · ${DOMAIN_LABEL[x.domain]}` : x.title })),
                                    ...(!canGeneral && !choices.length ? [{ value: "", label: design.isPending && execution.isPending ? "Loading…" : "No active projects" }] : []),
                                ]} />
                            <FieldError message={errors.show("project", projectError)} />
                        </div>
                        {general && !domain && (
                            <div className="field">
                                <label className="label required" htmlFor="mtg-for">For</label>
                                <Select id="mtg-for" value={belongs} onChange={setBelongs}
                                    options={[{ value: "", label: "The whole company" }, ...domains.map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))]} />
                            </div>
                        )}
                    </div>
                )}
                {general && (
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label className="label required" htmlFor="mtg-attendees">Attendees</label>
                        <PeoplePicker id="mtg-attendees" value={picked} onChange={setAttendees} options={invitable} none="Choose people" clear="Clear" />
                        <FieldError message={errors.show("attendees", attendeesError)} />
                    </div>
                )}
                <div className="grid g-2">
                    <div className="field">
                        <label className="label required" htmlFor="mtg-date">Date</label>
                        <DateInput id="mtg-date" className="input mono" value={day} required onChange={(v) => v && setDay(v)} />
                    </div>
                    <div className="field">
                        <label className="label required">Time</label>
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
            {showNew && <MeetingModal domain={project.domain as Domain} project={project} onClose={() => setShowNew(false)} />}
        </div>
    );
}

/**
 * Meetings, upcoming first, with the earlier ones folded away: a business's, or every one the person may see when
 * `domain` is null (the company overview). Opens the New meeting window from its link (?new=1). The Overview pages'
 * Meetings tab, with its own New meeting button, and the Meetings page's list.
 */
export function MeetingsBoard({ domain, newButton }: { domain: Domain | null; newButton?: boolean }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    const canRemove = useCanChangeMeeting();
    const [projectId, setProjectId] = useState("all");
    const [mine, setMine] = useState(false);
    const [showPast, setShowPast] = useState(false);
    // its own link (?new=1), so Proton or a shared link can open it
    const [showNew, setShowNew] = useUrlFlag("new");
    const inDomain = domain ?? undefined;
    const all = useMeetings({ domain: inDomain });
    const query = useMeetings({ domain: inDomain, projectId: projectId === "all" ? undefined : +projectId, mine });
    const now = new Date().toISOString();
    const list = query.data ?? [];
    const upcoming = list.filter((m) => m.endsAt >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = list.filter((m) => m.endsAt < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const projects = [...new Map((all.data ?? []).flatMap((m) => (m.project ? [[m.project.id, m.project] as const] : []))).values()]
        .sort((a, b) => a.title.localeCompare(b.title));
    const canCreate = permissions.hasAny(P.MEETING_CREATE, P.MEETING_MANAGE);
    const newMeeting = canCreate && <button className="btn" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>;

    function Row(m: Meeting) {
        const p = partsOf(m.startsAt);
        const today = dayKey(m.startsAt) === companyToday();
        const live = m.startsAt <= now && m.endsAt >= now;
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
                        {m.project ? (
                            <span className="row link-quiet" style={{ gap: 6, cursor: "pointer" }}
                                {...clickable(() => navigate(`/${m.domain ?? domain}/projects/${m.project!.id}?tab=meetings`), "link")}>
                                <ProjectTile icon={m.project.icon} tint={m.project.tint} size="sm" />{m.project.title}
                            </span>
                        ) : (
                            <>
                                <span className="row" style={{ gap: 5 }}><Icon name="people" />General meeting</span>
                                {!domain && <span>{m.domain ? DOMAIN_LABEL[m.domain] : "The whole company"}</span>}
                                <span>{m.attendees.map((a, i) => <span key={a.id}>{i > 0 && ", "}<PersonName person={a} /></span>)}</span>
                            </>
                        )}
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
        <>
            <div className="filters">
                <Select className="select sm" style={{ width: 220 }} aria-label="Project" value={projectId} onChange={setProjectId}
                    options={[{ value: "all", label: "All meetings" }, ...projects.map((x) => ({ value: String(x.id), label: x.title }))]} />
                <button className={cx("chip", mine && "on")} onClick={() => setMine(!mine)}><Icon name="user" />Set by me</button>
                {newButton && canCreate && <><span className="grow" /><button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button></>}
            </div>

            <Panel className="mt" title="Upcoming" sub={`${upcoming.length} meeting${upcoming.length === 1 ? "" : "s"}`} bodyStyle={{ paddingTop: 2 }}>
                {query.isPending ? <SkeletonLines lines={4} />
                    : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the meetings" />
                        : upcoming.length ? upcoming.map(Row) : (
                            <Empty art="time" title="No meetings coming up" action={newMeeting}
                                text={permissions.has(P.MEETING_MANAGE)
                                    ? "Set a general meeting for the people you choose, or one about an active project - it shows up on the project's Timeline."
                                    : "Schedule one for any project in your business - it shows up here for everyone, and on the project's Timeline."} />
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
        </>
    );
}

/** Every meeting in the domain the person may see, upcoming first (the prototype's P.Meetings): employees' page. */
export function MeetingsPage() {
    const domain = useDomain();
    const permissions = usePermissions();
    const [, setShowNew] = useUrlFlag("new");
    const query = useMeetings({ domain });
    const now = new Date().toISOString();
    const next = (query.data ?? []).filter((m) => m.endsAt >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

    return (
        <div className="page">
            <PageHead
                title="Meetings"
                sub={`${next ? `Next: ${next.topic || "meeting"} · ${fmtDayDate(next.startsAt)}, ${fmtTime(next.startsAt)}` : query.isPending ? "…" : "Nothing scheduled"} · anyone in ${DOMAIN_LABEL[domain]} can set a meeting`}
                actions={permissions.hasAny(P.MEETING_CREATE, P.MEETING_MANAGE) && <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" />New meeting</button>}
            />
            <MeetingsBoard domain={domain} />
        </div>
    );
}
