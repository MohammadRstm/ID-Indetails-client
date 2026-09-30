import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Schedules = Schemas["SchedulesResponse"];
export type PersonSchedule = Schemas["PersonScheduleResponse"];

const schedulesKey = ["company", "schedules"] as const;

/** Everyone's working week, and the company week they follow unless they have their own (schedule:manage). */
export function useSchedules(params: { domain: string | null; search: string }) {
    return useQuery({
        queryKey: [...schedulesKey, params],
        queryFn: async () => (await http.get<Schedules>("/company/schedules", { params: { domain: params.domain, search: params.search || null } })).data,
        placeholderData: keepPreviousData,
    });
}

/**
 * Gives someone their own week, or puts them back on the company week, from a day on. Their hours move what
 * counts as overtime, what their months ask for and so what they are paid.
 */
export function useSetSchedule(userId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["SetScheduleRequest"]) => (await http.put<PersonSchedule>(`/employees/${userId}/schedule`, body)).data,
        // the paid break of each day worked follows the schedule, so labour cost moves with it
        onSuccess: () => { void invalidate(schedulesKey, ["company"], keys.employees.all, keys.work.all, keys.projects.all, keys.finance.all, keys.dashboard.all); },
    });
}
