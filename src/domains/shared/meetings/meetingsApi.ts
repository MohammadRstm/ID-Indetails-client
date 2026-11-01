import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { fmtDayDate } from "@/shared/format/time";

export type Meeting = Schemas["MeetingResponse"];

/** "Meeting at Wed, Sep 30": a meeting's title is its date (the prototype's HL.meetingTitle). */
export const meetingTitle = (m: Pick<Meeting, "startsAt">) => `Meeting at ${fmtDayDate(m.startsAt)}`;

/** The person who set a meeting may change or remove it; meeting:manage covers any. */
export function useCanChangeMeeting() {
    const permissions = usePermissions();
    const me = useCurrentUser().id;
    return (m: Pick<Meeting, "createdBy">) => permissions.has(P.MEETING_MANAGE) || (permissions.has(P.MEETING_CREATE) && m.createdBy?.id === me);
}

/**
 * Meetings of the projects the person can see, and the general meetings they may see; a domain keeps that domain's
 * (company-wide ones stay in).
 */
export function useMeetings(params: { domain?: string; projectId?: number; mine?: boolean }) {
    const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== false));
    return useQuery({
        queryKey: keys.meetings.list(p),
        queryFn: async () => (await http.get<Meeting[]>("/meetings", { params: p })).data,
    });
}

export function useProjectMeetings(projectId: number) {
    return useQuery({
        queryKey: keys.meetings.project(projectId),
        queryFn: async () => (await http.get<Meeting[]>(`/projects/${projectId}/meetings`)).data,
    });
}

// a meeting shows in the day it falls on and on its project's timeline, so both refresh with it
export function useCreateMeeting() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ projectId, body }: { projectId: number; body: Schemas["SaveMeetingRequest"] }) =>
            (await http.post<Meeting>(`/projects/${projectId}/meetings`, body)).data,
        onSuccess: (_, { projectId }) => { void invalidate(keys.meetings.all, keys.activity.all, keys.work.all, keys.projects.detail(projectId)); },
    });
}

/** A meeting about no project, for its attendees; `domain` null is the whole company. */
export function useCreateGeneralMeeting() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["SaveGeneralMeetingRequest"]) => (await http.post<Meeting>("/meetings", body)).data,
        onSuccess: () => { void invalidate(keys.meetings.all, keys.work.all); },
    });
}

export function useDeleteMeeting() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id }: { id: number; projectId: number | null }) => {
            await http.delete(`/meetings/${id}`);
        },
        onSuccess: (_, { projectId }) => {
            void invalidate(keys.meetings.all, keys.work.all, ...(projectId != null ? [keys.projects.detail(projectId)] : []));
        },
    });
}
