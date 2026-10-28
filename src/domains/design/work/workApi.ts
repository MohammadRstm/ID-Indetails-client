import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import type { Domain } from "@/app/permissions/permissions";
import useDebounce from "@/shared/hooks/useDebounce";

/*
 * A person's own work: the projects they log against, their day, entries, overtime and settings.
 * Design only - Execution staff log no hours.
 */

export type WorkEntry = Schemas["WorkEntryResponse"];
export type MyProject = Schemas["MyProjectResponse"];
export type MyDay = Schemas["MyDayResponse"];
export type MySchedule = Schemas["MyScheduleResponse"];
export type OvertimePreview = Schemas["OvertimePreviewResponse"];
export type OvertimePreviewBody = Schemas["OvertimePreviewRequest"];
export type SaveEntryBody = Schemas["SaveWorkEntryRequest"];
export type DomainSettings = Schemas["DomainSettingsResponse"];
export type EntryMove = Schemas["WorkEntryMoveRequest"];

/** The domain's time-tracking rules (edit window, overlaps, future entries, the timer, descriptions). */
export function useDomainSettings(domain: Domain | null) {
    return useQuery({
        queryKey: keys.settings.domain(domain ?? ""),
        queryFn: async () => (await http.get<DomainSettings>(`/domain-settings/${domain}`)).data,
        enabled: domain != null,
        staleTime: 5 * 60_000,
    });
}

/** The projects the person works on, with their own hours and when they last worked there. */
export function useMyProjects(enabled = true) {
    return useQuery({
        queryKey: keys.work.myProjects,
        queryFn: async () => (await http.get<MyProject[]>("/me/projects")).data,
        enabled,
    });
}

/** The projects that take new work, the ones last worked on first (and an edited entry's own). */
export function loggableProjects(projects: MyProject[], keepId?: number): MyProject[] {
    return projects
        .filter((p) => p.acceptsWork || p.id === keepId)
        .sort((a, b) => (b.myLastStartedAt ?? "").localeCompare(a.myLastStartedAt ?? "") || a.title.localeCompare(b.title));
}

/** Their work on one project: totals, weekly hours, recent entries and what the team is doing. */
export function useMyProjectWork(projectId: number, enabled = true) {
    return useQuery({
        queryKey: keys.work.myProject(projectId),
        queryFn: async () => (await http.get<Schemas["MyProjectWorkResponse"]>(`/me/projects/${projectId}/work`)).data,
        enabled,
    });
}

/** Their totals: today, this week, this month, per day and per project. */
export function useMyWorkSummary(params: { from?: string; to?: string; projectId?: number; search?: string } = {}) {
    return useQuery({
        queryKey: keys.work.summary(params),
        queryFn: async () => (await http.get<Schemas["WorkSummaryResponse"]>("/me/work-summary", { params })).data,
        placeholderData: keepPreviousData,
    });
}

/** Their entries, newest first: a date range, a project and a search narrow them. */
export function useMyEntries(params: { from?: string; to?: string; projectId?: number; search?: string; page?: number; pageSize?: number }) {
    const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
    return useQuery({
        queryKey: keys.work.entries(p),
        queryFn: async () => (await http.get<Paged<WorkEntry>>("/me/work-entries", { params: p })).data,
        placeholderData: keepPreviousData,
    });
}

/** One of their days: its entries and the meetings on it. */
export function useMyDay(date: string) {
    return useQuery({
        queryKey: keys.work.day(date),
        queryFn: async () => (await http.get<MyDay>("/me/day", { params: { date } })).data,
        placeholderData: keepPreviousData,
    });
}

/** The working hours their schedule sets on a day, and what the day asks for. */
export function useMySchedule(date: string) {
    return useQuery({
        queryKey: keys.work.schedule(date),
        queryFn: async () => (await http.get<MySchedule>("/me/schedule", { params: { date } })).data,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
    });
}

/** Overtime in a month, day by day and entry by entry: the person's own, or someone's (work_entry:view_all). */
export function useMyOvertime(month: string, userId: number | null = null) {
    return useQuery({
        queryKey: userId == null ? keys.work.overtime(month) : [...keys.employees.all, "overtime", userId, month],
        queryFn: async () => (await http.get<Schemas["MyOvertimeResponse"]>(userId == null ? "/me/overtime" : `/employees/${userId}/overtime`, { params: { month } })).data,
        placeholderData: keepPreviousData,
    });
}

/** Their hours balance, month by month: what each month asked for and what was covered. */
export function useMyHours(enabled = true) {
    return useQuery({
        queryKey: keys.work.hours,
        queryFn: async () => (await http.get<Schemas["MyHoursResponse"]>("/me/hours", { params: { page: 1 } })).data,
        enabled,
    });
}

/**
 * How much of a piece of work would be overtime, given the rest of their day. The API works it out, so
 * the client never keeps its own copy of the rule. Null while there is nothing to ask about.
 */
export function useOvertimePreview(body: OvertimePreviewBody | null) {
    return useQuery({
        queryKey: keys.work.preview(body ?? {}),
        queryFn: async () => (await http.post<OvertimePreview>("/me/overtime-preview", body)).data,
        enabled: body != null,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
}

/**
 * The overtime preview of a piece of work that changes as it is dragged or typed: asked once it stops
 * changing for a moment. `current` says the answer is for what is on screen now.
 */
export function useOvertimeFor(body: OvertimePreviewBody | null, delay = 150) {
    // a string, so the debounce compares values, not a new object each render
    const key = body ? JSON.stringify(body) : "";
    const settled = useDebounce({ value: key, debounceTimeMs: delay });
    const query = useOvertimePreview(settled ? (JSON.parse(settled) as OvertimePreviewBody) : null);
    const current = settled === key && !query.isPlaceholderData;
    return { preview: current ? query.data : undefined, last: query.data, current };
}

/** What a saved or deleted entry changes: every total and list built on work. */
function useWorkChanged() {
    const invalidate = useInvalidate();
    // logged work is labour cost too: the money screens and the company figures follow
    return () => { void invalidate(keys.work.all, keys.projects.all, keys.clients.all, keys.activity.all, keys.dashboard.all, keys.finance.all, ["company"]); };
}

export function useSaveEntry() {
    const changed = useWorkChanged();
    return useMutation({
        mutationFn: async ({ id, body }: { id?: number; body: SaveEntryBody }) =>
            (id ? await http.put<WorkEntry>(`/work-entries/${id}`, body) : await http.post<WorkEntry>("/work-entries", body)).data,
        onSuccess: changed,
    });
}

/** An admin's correction of whether someone's entry is outside the project's original scope (work_entry:view_all). */
export function useSetEntryScope() {
    const changed = useWorkChanged();
    return useMutation({
        mutationFn: async ({ id, outsideScope }: { id: number; outsideScope: boolean }) =>
            (await http.put<WorkEntry>(`/work-entries/${id}/scope`, { outsideScope })).data,
        onSuccess: changed,
    });
}

export function useDeleteEntry() {
    const changed = useWorkChanged();
    return useMutation({
        mutationFn: async (id: number) => {
            await http.delete(`/work-entries/${id}`);
        },
        onSuccess: changed,
    });
}

/**
 * Undoes a save: deletes the new log (when there is one), puts back the entries it moved or the one it changed,
 * then the logs it deleted. One step, so it finishes even though the form it came from has closed (a per-call
 * callback on a closed form never runs).
 */
export function useUndoLog() {
    const changed = useWorkChanged();
    return useMutation({
        mutationFn: async ({ id, restore, deleted = [] }: { id?: number; restore: { id: number; body: SaveEntryBody } | null; deleted?: number[] }) => {
            if (id != null) await http.delete(`/work-entries/${id}`);
            if (restore) await http.put<WorkEntry>(`/work-entries/${restore.id}`, restore.body);
            for (const gone of deleted) await http.post<WorkEntry>(`/work-entries/${gone}/restore`);
        },
        onSuccess: changed,
    });
}

/** Puts a deleted entry back, exactly as it was (Undo). */
export function useRestoreEntry() {
    const changed = useWorkChanged();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<WorkEntry>(`/work-entries/${id}/restore`)).data,
        onSuccess: changed,
    });
}

/** Uploads an image (made small first) or a video for an entry. */
export { uploadFile } from "@/shared/files/upload";

/** Moves a meeting on the timeline (its ends dragged). */
export function useResizeMeeting() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Schemas["SaveMeetingRequest"] }) =>
            (await http.put<Schemas["MeetingResponse"]>(`/meetings/${id}`, body)).data,
        // it shows on its project's timeline too
        onSuccess: (meeting) => { void invalidate(keys.meetings.all, keys.work.all, keys.projects.detail(meeting.project.id)); },
    });
}

/** The body that saves an entry as it is, with one thing changed (an attachment added later). */
export function entryBody(entry: WorkEntry, change: Partial<SaveEntryBody> = {}): SaveEntryBody {
    return {
        projectId: entry.project.id,
        description: entry.description,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        attachmentFileId: entry.attachment?.id ?? null,
        outsideScope: entry.outsideScope,
        ...change,
    };
}
