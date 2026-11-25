import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";

/*
 * These types mirror the API's NotLoggingResponse and HoursRemindersResponse; they move to the generated schema
 * once `npm run api:types` has been run against the API that has them.
 */

export type NotLoggingPerson = {
    id: number;
    name: string;
    email: string;
    photoFileId: number | null;
    /** The three minutes are null for someone who may not see everyone's work (work_entry:view_all). */
    loggedMinutes: number | null;
    expectedMinutes: number | null;
    overtimeMinutes: number | null;
    remindedToday: boolean;
};

export type NotLogging = {
    /** The first day of this week, as the company sets its week. */
    weekStart: string;
    today: string;
    people: NotLoggingPerson[];
};

export type RemindersSent = { reminded: number; skipped: number };

/** The employees who have logged nothing this week, by name (report:view). */
export function useNotLogging() {
    return useQuery({
        queryKey: keys.dashboard.notLogging,
        queryFn: async () => (await http.get<NotLogging>("/reports/not-logging")).data,
    });
}

/** Asks one employee to log their hours; once a day each. A refused one (already reminded, or logged since) refreshes the list too. */
export function useRemind() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (userId: number) => (await http.post<RemindersSent>(`/reports/not-logging/${userId}/reminder`)).data,
        onSettled: () => invalidate(keys.dashboard.notLogging),
    });
}

/** Asks everyone on the list who hasn't been reminded today. */
export function useRemindAll() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async () => (await http.post<RemindersSent>("/reports/not-logging/reminders")).data,
        onSettled: () => invalidate(keys.dashboard.notLogging),
    });
}
