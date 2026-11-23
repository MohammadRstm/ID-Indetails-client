import { useState, type FormEvent } from "react";
import { errorMessage } from "@/api/errors";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { projectLabel } from "@/domains/shared/projects/projectCodes";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import CharCount from "@/shared/components/Forms/CharCount";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { dayKey, fmtDayDate, fmtDayDateY, fmtDur, fmtH, fmtRange, minutesOfDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Schemas } from "@/api/types";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillEmpty, useProtonForm } from "@/domains/shared/proton/formFill";
import { useAttachment } from "./attachments";
import { AttachmentField } from "./AttachmentField";
import { checkLog, companyNow, DAY, DEFAULT_START, DESCRIPTION_MAX, defaultSlot, isoAt, movesFor, restoreOf, spanOn, workHoursOf, type Moves } from "./day";
import DayChips from "./DayChips";
import DragDay from "./DragDay";
import { closeLogWork, type LogWorkOptions } from "./logWorkStore";
import { ScopeCheck } from "./Scope";
import TimeRange from "./TimeRange";
import { startTimer } from "./timer";
import {
    entryBody, loggableProjects, useDeleteEntry, useDomainSettings, useMyDay, useMyProjects, useMySchedule, isKeptLog, useOvertimeFor, useSaveEntry, useUndoLog,
    type DomainSettings, type MyProject, type WorkEntry,
} from "./workApi";

/** Shows Log work wherever it was opened from. */
/** Waits for what the form needs to open on a sensible time, then shows it. */
export default function LogWorkModal({ options }: { options: LogWorkOptions }) {
    const { today } = companyNow();
    const edit = options.edit;
    const firstDay = edit ? dayKey(edit.startedAt) : options.date ?? today;
    const projects = useMyProjects();
    const settings = useDomainSettings("design");
    const day = useMyDay(firstDay);
    const schedule = useMySchedule(firstDay);
    // only a load with nothing to show blocks the form; a failed refresh keeps what it had
    const failed = [projects, settings, day, schedule].find((q) => q.isError && !q.data)?.error;
    const ready = projects.data && settings.data && day.data && !day.isPlaceholderData && schedule.data;

    if (!ready || failed) {
        return (
            <Modal size="md" title={edit ? "Edit work entry" : options.overtime ? "Log overtime" : "Log work"} onClose={closeLogWork}
                foot={<><div className="grow" /><button className="btn" onClick={closeLogWork}>Cancel</button></>}>
                {failed ? <LoadError error={failed} retry={() => { projects.refetch(); settings.refetch(); day.refetch(); schedule.refetch(); }} what="your day" /> : <SkeletonLines lines={6} />}
            </Modal>
        );
    }
    const hours = workHoursOf(schedule.data.day);
    return <LogWorkForm options={options} firstDay={firstDay} projects={projects.data} settings={settings.data} dayEntries={day.data.entries}
        dayStart={hours?.s ?? DEFAULT_START} dayEnd={hours?.e ?? null} />;
}

type FormProps = {
    options: LogWorkOptions;
    firstDay: string;
    projects: MyProject[];
    settings: DomainSettings;
    dayEntries: WorkEntry[];
    /** When the working day starts: an empty day's first log starts there. 9 AM on a day off. */
    dayStart: number;
    /** When the working day ends ("Log overtime" starts there); null on a day off. */
    dayEnd: number | null;
};

/** The window itself (the prototype's P.LogWork): what was done, when, and on which project. */
function LogWorkForm({ options, firstDay, projects, settings, dayEntries, dayStart, dayEnd }: FormProps) {
    const me = useCurrentUser();
    const { today, minute: nowMin } = companyNow();
    const ed = options.edit ?? null;
    const choices = loggableProjects(projects, ed?.project.id);
    const [initial] = useState(() => firstSlot(options, firstDay, dayEntries, dayStart, dayEnd, today, nowMin));
    const [projectId, setProjectId] = useState<number | null>(ed ? ed.project.id : options.projectId ?? choices[0]?.id ?? null);
    const [date, setDate] = useState(firstDay);
    const [startMin, setStartMin] = useState(initial.s);
    const [duration, setDuration] = useState(initial.d);
    const [desc, setDesc] = useState(ed?.description ?? "");
    const [outside, setOutside] = useState(ed?.outsideScope ?? false);
    const [touched, setTouched] = useState(false);
    const [swaps, setSwaps] = useState<Moves>({});
    // logs deleted on the timeline, sent with the save
    const [deletes, setDeletes] = useState<number[]>([]);
    // a plain new log moves to another day's first free time once that day has loaded
    const [slotFor, setSlotFor] = useState<string | null>(null);
    const attachment = useAttachment(ed?.attachment ?? null);
    const save = useSaveEntry();
    const remove = useDeleteEntry();
    const [removing, setRemoving] = useState(false);
    const undo = useUndoLog();
    const day = useMyDay(date);
    const schedule = useMySchedule(date);
    const plain = !ed && !options.overtime && options.startMin == null && options.endMin == null;
    // Proton fills a new log only: the project, day and time it was asked for replace the form's own first guess
    const proton = useProtonForm("log_work", null, (fill) => {
        const v = fill.logWork;
        const done: string[] = [];
        if (!v || ed) return done;
        if (v.projectId != null && choices.some((c) => c.id === v.projectId)) {
            setProjectId(v.projectId);
            done.push("project");
        }
        if (v.day) {
            setDate(v.day);
            setSwaps({});
            setDeletes([]);
            setSlotFor(v.startMinute == null ? v.day : null);
            done.push("day");
        }
        if (v.startMinute != null) {
            setStartMin(v.startMinute);
            done.push("start");
            if (v.endMinute != null) {
                setDuration((v.endMinute - v.startMinute + DAY) % DAY || DAY);
                done.push("end");
            }
        }
        fillEmpty(desc, v.description, setDesc, "description", done);
        return done;
    });

    if (slotFor && slotFor === date && day.data && !day.isPlaceholderData && day.data.date.slice(0, 10) === date) {
        // hours waiting for approval hold their time too
        const taken = [...day.data.entries, ...(day.data.waiting ?? [])].map((e) => spanOn(e, date));
        const sl = defaultSlot(taken, workHoursOf(schedule.data?.day)?.s ?? DEFAULT_START, date === today, nowMin);
        setSlotFor(null);
        setStartMin(sl.s);
        setDuration(sl.d);
    }

    const list = (day.data?.entries ?? []).filter((e) => e.id !== ed?.id && !deletes.includes(e.id));
    const startAt = isoAt(date, startMin), endAt = isoAt(date, startMin + duration);
    const nextDay = startMin + duration >= DAY;
    const tooLong = duration > 12 * 60;
    const project = projects.find((p) => p.id === projectId);
    const { preview } = useOvertimeFor({ startedAt: startAt, endedAt: endAt, entryId: ed?.id ?? null, moves: movesFor(date, swaps), deletes });
    const ot = preview?.overtimeMinutes ?? 0;
    const error = checkLog({
        projectId, day: date, startMin, duration, others: list, moves: swaps, ignoreId: ed?.id,
        allowFuture: settings.allowFutureEntries, allowOverlap: settings.allowOverlap,
    }) ?? (settings.requireDescription && !desc.trim() && touched ? "Say what you worked on." : null);
    // a project that stopped taking work (the timer ran on it) has to be picked again from the list
    const unlisted = !ed && !choices.some((c) => c.id === projectId);
    const busy = attachment.uploading || save.isPending || removing;
    // logged tasks moved, resized or deleted on the timeline. Without a new log written (nothing said, no file), only
    // those changes are saved; with one, the new log goes in with them
    const changed = Object.keys(swaps).length > 0 || deletes.length > 0;
    const changesOnly = !ed && changed && !desc.trim() && !attachment.file;
    const blocked = changesOnly ? busy : !!error || unlisted || (settings.requireDescription && !desc.trim()) || busy;
    const shownError = changesOnly ? null : error;

    function pickDay(d: string) {
        setDate(d);
        setSwaps({});
        setDeletes([]);
        if (plain) setSlotFor(d);
    }

    /** Puts the logged tasks a swap moved back where they were (for Undo). */
    function movesBack(): Moves {
        const back: Moves = {};
        for (const id of Object.keys(swaps)) {
            const e = list.find((x) => x.id === +id);
            if (e) back[+id] = spanOn(e, date);
        }
        return back;
    }

    /** Saves only what changed on the timeline: one moved task is saved with the others' moves and the deletions, in one go. */
    async function saveChanges() {
        const movedIds = Object.keys(swaps).map(Number);
        const first = list.find((x) => x.id === movedIds[0]);
        const n = movedIds.length + deletes.length;
        const sub = `${fmtDayDate(startAt)} · ${n === 1 ? "1 logged task" : `${n} logged tasks`}`;
        const back = movesBack();
        try {
            if (first) {
                const rest = { ...swaps };
                delete rest[first.id];
                const at = swaps[first.id];
                await save.mutateAsync({ id: first.id, body: entryBody(first, { startedAt: isoAt(date, at.s), endedAt: isoAt(date, at.e), moves: movesFor(date, rest), deletes }) });
                const backRest = { ...back };
                delete backRest[first.id];
                closeLogWork();
                toast({
                    text: "Changes saved", sub, icon: "checkCircle", actionLabel: "Undo",
                    action: () => undo.mutate({ restore: { id: first.id, body: { ...entryBody(first), moves: movesFor(date, backRest) } }, deleted: deletes }),
                });
                return;
            }
            setRemoving(true);
            for (const id of deletes) await remove.mutateAsync(id);
            closeLogWork();
            toast({ text: "Changes saved", sub, icon: "checkCircle", actionLabel: "Undo", action: () => undo.mutate({ restore: null, deleted: deletes }) });
        } catch (failure) {
            // a refused save says why in the form's foot; a delete that failed says it here
            if (!first) toast({ text: "Your changes weren't saved", sub: errorMessage(failure), icon: "alert" });
        } finally {
            setRemoving(false);
        }
    }

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (changesOnly) {
            if (!blocked) void saveChanges();
            return;
        }
        setTouched(true);
        if (blocked || projectId == null) return;
        const back = movesBack();
        // worked out now, while the day is loaded: the form has closed by the time Undo is pressed
        const restore = restoreOf(list, date, swaps);
        const body = {
            projectId, description: desc, startedAt: startAt, endedAt: endAt, attachmentFileId: attachment.file?.id ?? null, outsideScope: outside,
            moves: movesFor(date, swaps), deletes,
        };
        const title = project?.title ?? "the project";
        save.mutate({ id: ed?.id, body }, {
            onSuccess: (saved) => {
                closeLogWork();
                if (ed) {
                    toast({
                        text: "Entry updated", sub: `${title} · ${fmtDayDate(startAt)} · ${fmtRange(startAt, endAt)}`, icon: "checkCircle",
                        actionLabel: "Undo", action: () => undo.mutate({ restore: { id: ed.id, body: { ...entryBody(ed), moves: movesFor(date, back) } }, deleted: deletes }),
                    });
                    return;
                }
                toast({
                    text: `${fmtDur(saved.minutes)} logged on ${title}`, sub: `${fmtDayDate(startAt)} · ${fmtRange(startAt, endAt)}`, icon: "checkCircle",
                    actionLabel: "Undo", action: () => undo.mutate({ id: saved.id, restore, deleted: deletes }),
                });
            },
            onError: (failure) => {
                if (!isKeptLog(failure)) return;
                closeLogWork();
                toast({ text: "Your hours wait for approval", sub: `Your department isn't part of ${title}.`, icon: "clock" });
            },
        });
    }

    const failure = save.error && !shownError && !isKeptLog(save.error) ? <FormFailure error={save.error} onForced={closeLogWork} /> : null;
    const required = preview?.requiredMinutes ?? schedule.data?.day.requiredMinutes;

    return (
        <Modal surfaceId={ed ? undefined : "log_work"} size="md" title={ed ? "Edit work entry" : options.overtime ? "Log overtime" : "Log work"} onClose={closeLogWork}
            sub={options.overtime ? `Work outside your working hours, on a day off, or past the ${required != null ? fmtH(required) : "hours"} your day asks for counts as overtime.` : "What you did, and exactly when you did it."}
            foot={
                <>
                    <div className="grow">
                        {shownError ? <span className="err"><Icon name="alert" />{shownError}</span> : failure ? failure
                            : <span className="muted">{fmtDayDate(startAt)} · <span className="mono">{fmtRange(startAt, endAt)}</span>{nextDay ? " (ends next day)" : ""}</span>}
                    </div>
                    <button className="btn" onClick={closeLogWork}>Cancel</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => submit()}>
                        {ed || changesOnly ? "Save changes" : `Log ${fmtDur(duration)}${changed ? " and save changes" : ""}`}
                        {!changesOnly && ot ? ` · ${fmtDur(ot)} overtime` : ""}
                    </button>
                </>
            }>
            <form className="log-form" onSubmit={submit} {...proton.guard}>
                <FilledNote fields={proton.filled} />
                {!ed && <ExcuseNote excuse={day.data?.date.slice(0, 10) === date ? day.data?.excuse : null} />}
                <div className="grid g-2">
                    <div className="field">
                        <label className="label required" htmlFor="lw-project">Project</label>
                        <Select id="lw-project" value={projectId == null ? "" : String(projectId)} onChange={(v) => setProjectId(+v)}
                            options={choices.map((p) => ({ value: String(p.id), label: projectLabel(p) }))} />
                        <div className="hint">Only active projects accept new work.</div>
                    </div>
                    {/* a log already made keeps its day, as does one opened on a picked day: it is only named */}
                    {ed || options.fixedDay ? (
                        <div className="field">
                            <div className="label">{ed ? "Logged on" : "Logging on"}</div>
                            <div style={{ minHeight: 34, display: "flex", alignItems: "center", fontWeight: 600 }}>{fmtDayDateY(date)}</div>
                        </div>
                    ) : (
                        <div className="field">
                            <label className="label required">What day to log?</label>
                            <DayChips value={date} onChange={pickDay} count={5} />
                        </div>
                    )}
                </div>

                <div className="field mt">
                    <label className={settings.requireDescription ? "label required" : "label"} htmlFor="lw-desc">What did you work on?</label>
                    <AutoGrowTextarea id="lw-desc" className="textarea" autoFocus minRows={2} maxRows={4} maxLength={DESCRIPTION_MAX}
                        placeholder={`${settings.requireDescription ? "" : "Optional - "}e.g. Detailed the kitchen joinery drawings for the client review`}
                        value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => setTouched(true)}
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }} />
                    <CharCount length={desc.length} max={DESCRIPTION_MAX} />
                </div>

                <AttachmentField state={attachment} />

                <div className="panel mt" style={{ background: "var(--surface-2)" }}>
                    <div className="panel-body">
                        <TimeRange date={date} startMin={startMin} duration={duration}
                            onChange={(s, d) => { setStartMin(s); setDuration(d); }} />
                        <div className="mt">
                            <DragDay date={date} startMin={startMin} duration={duration} projectId={projectId} ignoreId={ed?.id} swaps={swaps}
                                deleted={deletes} onDeleted={setDeletes}
                                onChange={(s, d, sw) => { setStartMin(s); setDuration(d); if (sw) setSwaps(sw); }} />
                        </div>
                        {tooLong && <div className="hint mt-s">That is a long stretch - if it spanned a break, two entries will read better in reports.</div>}
                        {options.shortTimer != null && (
                            <div className="hint mt-s">
                                Your timer ran {options.shortTimer < 1 ? "under a minute" : fmtDur(options.shortTimer)}. An entry is at least 5 minutes, so it is logged as 5 - change the times if that isn't right.
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt"><ScopeCheck checked={outside} onChange={setOutside} /></div>
                <div className="row mt-s" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span className="hint">Tip: type “4pm”, “16:00” or “4:30p” - and ⌘/Ctrl + Enter to save.</span>
                    {settings.timerEnabled && !ed ? (
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => { closeLogWork(); startTimer(me.id, projectId); }}>
                            <Icon name="play" />Use a timer instead
                        </button>
                    ) : <span />}
                </div>
            </form>
        </Modal>
    );
}

/**
 * Where the window opens (the prototype's rules): an edited entry where it is; overtime from the end of
 * the working day up to now; given times as given; otherwise the day's first free time.
 */
function firstSlot(o: LogWorkOptions, day: string, entries: WorkEntry[], dayStart: number, dayEnd: number | null, today: string, nowMin: number): { s: number; d: number } {
    if (o.edit) return { s: minutesOfDay(o.edit.startedAt), d: o.edit.minutes };
    const isToday = day === today;
    // a day off is all overtime, and today's overtime can't start before the working day ends: the usual slot
    const noOvertimeStart = dayEnd == null || (isToday && nowMin <= dayEnd);
    if ((!o.overtime || noOvertimeStart) && o.startMin == null && o.endMin == null) {
        return defaultSlot(entries.map((e) => spanOn(e, day)), dayStart, isToday, nowMin);
    }
    const workEnd = dayEnd ?? 17 * 60;
    const end = o.endMin ?? (o.overtime && isToday && nowMin > workEnd ? Math.floor(nowMin / 5) * 5
        : isToday ? Math.max(10 * 60, Math.floor(nowMin / 15) * 15) : 12 * 60);
    const start = o.startMin ?? (o.overtime ? workEnd : Math.max(0, end - (isToday ? 120 : 180)));
    return { s: start, d: (end - start + DAY) % DAY || (o.overtime ? 60 : 120) };
}

/**
 * Before logging on a day an excuse covers: the hours logged take the excuse's place, so nothing counts twice. A day
 * excused loses this day; minutes excused in the month give way only for what the month no longer needs; a month
 * excused in full stays as it is, and whoever excused it is told.
 */
function ExcuseNote({ excuse }: { excuse?: Schemas["DayExcuseResponse"] | null }) {
    if (!excuse) return null;
    const text = excuse.wholeMonth
        ? "This whole month is excused for you. Logging here doesn't change that excuse: whoever gave it is told and decides."
        : excuse.day
            ? "You were excused on this day. Logging here takes this day off the excuse, so log the whole day you worked."
            : `You have ${fmtH(excuse.monthMinutes)} excused this month. Hours you log in their place come off the excuse once the month no longer needs it.`;
    return <div className="banner excuse-note" role="note"><Icon name="info" /><div className="grow">{text}</div></div>;
}
