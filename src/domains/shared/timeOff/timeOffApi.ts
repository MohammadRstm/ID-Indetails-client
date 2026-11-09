import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import { companyToday } from "@/shared/format/time";

export type TimeOff = Schemas["TimeOffResponse"];
export type TimeOffStatus = Schemas["TimeOffStatus"];
export type TimeOffView = Schemas["TimeOffView"];
export type Away = Schemas["AwayResponse"];

/** What a reason or a decision note may hold, as the API keeps it (TimeOffRules.MaxNoteLength). */
export const TIME_OFF_NOTE_MAX = 500;

/** Time off changes pay, hours owed and who is off. */
function useInvalidateTimeOff() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.timeOff.all, ["company", "salaries"], keys.employees.all, keys.work.all); };
}

/** The signed-in employee's own requests, newest first. */
export function useMyTimeOff() {
    return useQuery({ queryKey: keys.timeOff.mine(), queryFn: async () => (await http.get<TimeOff[]>("/me/time-off")).data });
}

export function useAskTimeOff() {
    const done = useInvalidateTimeOff();
    return useMutation({
        mutationFn: async (body: { firstDay: string; lastDay: string; reason: string }) => (await http.post<TimeOff>("/me/time-off", body)).data,
        onSuccess: done,
    });
}

export function useWithdrawTimeOff() {
    const done = useInvalidateTimeOff();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<TimeOff>(`/me/time-off/${id}/withdraw`)).data,
        onSuccess: done,
    });
}

/** Everyone's requests, for the super admins: waiting, current and upcoming, or past. */
export function useTimeOffList(view: TimeOffView, page = 1, pageSize = 25) {
    return useQuery({
        queryKey: keys.timeOff.list(view, page),
        queryFn: async () => (await http.get<Paged<TimeOff>>("/time-off", { params: { view, page, pageSize } })).data,
        placeholderData: keepPreviousData,
    });
}

export function useApproveTimeOff() {
    const done = useInvalidateTimeOff();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; isPaid: boolean; note?: string }) => (await http.post<TimeOff>(`/time-off/${id}/approve`, body)).data,
        onSuccess: done,
    });
}

export function useDeclineTimeOff() {
    const done = useInvalidateTimeOff();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; note?: string }) => (await http.post<TimeOff>(`/time-off/${id}/decline`, body)).data,
        onSuccess: done,
    });
}

export function useRejectTimeOff() {
    const done = useInvalidateTimeOff();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; note?: string }) => (await http.post<TimeOff>(`/time-off/${id}/reject`, body)).data,
        onSuccess: done,
    });
}

/** Who is off on any day from `from` to `to` (both "yyyy-MM-dd"; today by default): never why, nor whether it is paid. */
export function useAway(from?: string, to?: string) {
    const first = from ?? companyToday();
    const last = to ?? first;
    return useQuery({
        queryKey: keys.timeOff.away(first, last),
        queryFn: async () => (await http.get<Away[]>("/time-off/away", { params: { from: first, to: last } })).data,
        staleTime: 5 * 60_000,
    });
}

/** The last day someone is off, when they are off on any of the days asked for. */
export function offUntil(away: Away[] | undefined, userId: number): string | null {
    const theirs = away?.filter((a) => a.userId === userId) ?? [];
    return theirs.length === 0 ? null : theirs.map((a) => a.lastDay).sort().at(-1)!;
}
