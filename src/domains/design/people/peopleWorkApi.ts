import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import { ME_KEY } from "@/app/session/sessionContext";

/* People and their profiles: the list with each person's work, one person, and changing them. */

export type PersonWork = Schemas["PersonWorkResponse"];
export type Employee = Schemas["EmployeeResponse"];
export type Team = Schemas["TeamResponse"];
export type Pay = Schemas["PayResponse"];

/** Everyone's week, quarter and totals, with focus and cost (work_entry:view_all). */
export function usePeopleWork(enabled = true) {
    return useQuery({
        queryKey: [...keys.employees.all, "work"],
        queryFn: async () => (await http.get<PersonWork[]>("/work/people")).data,
        enabled,
    });
}

export function useEmployee(userId: number, enabled = true) {
    return useQuery({
        queryKey: [...keys.employees.all, "detail", userId],
        queryFn: async () => (await http.get<Employee>(`/employees/${userId}`)).data,
        enabled,
    });
}

/** A person's work totals: the signed-in person's own, or someone else's (work_entry:view_all). */
export function usePersonWorkSummary(userId: number | null) {
    return useQuery({
        queryKey: userId == null ? keys.work.summary({}) : [...keys.employees.all, "work-summary", userId],
        queryFn: async () => (await http.get<Schemas["WorkSummaryResponse"]>(userId == null ? "/me/work-summary" : `/employees/${userId}/work-summary`)).data,
    });
}

/** Their newest entries. */
export function usePersonEntries(userId: number | null, pageSize = 18) {
    return useQuery({
        queryKey: userId == null ? keys.work.entries({ page: 1, pageSize }) : [...keys.employees.all, "entries", userId, pageSize],
        queryFn: async () => (await http.get<Paged<Schemas["WorkEntryResponse"]>>(userId == null ? "/me/work-entries" : "/work-entries",
            { params: userId == null ? { page: 1, pageSize } : { userId, page: 1, pageSize } })).data,
        placeholderData: keepPreviousData,
    });
}

/** Their labour cost, all time, this quarter and by project (financial:view). */
export function useLabourCost(userId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.employees.all, "labour-cost", userId],
        queryFn: async () => (await http.get<Schemas["EmployeeLabourCostResponse"]>(`/employees/${userId}/labour-cost`)).data,
        enabled,
    });
}

/** Their pay history, newest last (employee:pay_manage). */
export function usePayHistory(userId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.employees.all, "pay", userId],
        queryFn: async () => (await http.get<Pay[]>(`/employees/${userId}/pay`)).data,
        enabled,
    });
}

/** Someone else's hours balance (salary:view). */
export function usePersonHours(userId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.employees.all, "hours", userId],
        queryFn: async () => (await http.get<Schemas["MyHoursResponse"]>(`/employees/${userId}/hours`, { params: { page: 1 } })).data,
        enabled,
    });
}

/** The teams of a domain. */
export function useTeams(domain: string, enabled = true) {
    return useQuery({
        queryKey: ["teams", domain],
        queryFn: async () => (await http.get<Team[]>("/teams")).data.filter((t) => t.domain === domain),
        enabled,
        staleTime: 5 * 60_000,
    });
}

function usePeopleChanged() {
    const invalidate = useInvalidate();
    return () => invalidate(keys.employees.all, ME_KEY, keys.work.all);
}

export function useInvite() {
    const changed = usePeopleChanged();
    return useMutation({
        mutationFn: async (body: Schemas["CreateInvitationRequest"]) => (await http.post<Schemas["InvitationResponse"]>("/invitations", body)).data,
        onSuccess: changed,
    });
}

export function useUpdateEmployee(userId: number) {
    const changed = usePeopleChanged();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateEmployeeRequest"]) => (await http.put<Employee>(`/employees/${userId}`, body)).data,
        onSuccess: changed,
    });
}

/** Someone's place in the company changed: their lists, chats, salaries and schedules follow. */
function useAccountChanged() {
    const invalidate = useInvalidate();
    // not awaited: the dialog closes and says so at once, and the page follows as the lists reload
    return () => { void invalidate(keys.employees.all, ME_KEY, keys.work.all, ["company"], ["messages"], ["teams"]); };
}

/** Ends their employment on their last working day and blocks sign-in; their history stays (employee:manage). */
export function useDeactivate(userId: number) {
    const changed = useAccountChanged();
    return useMutation({
        mutationFn: async (lastWorkingDay: string | null) => (await http.post<Employee>(`/employees/${userId}/deactivate`, { lastWorkingDay })).data,
        onSuccess: changed,
    });
}

/** Active again (a new period of employment), or invited again if they never signed up (employee:manage). */
export function useReactivate(userId: number) {
    const changed = useAccountChanged();
    return useMutation({
        mutationFn: async (payGap: boolean | null) => (await http.post<Employee>(`/employees/${userId}/reactivate`, payGap == null ? {} : { payGap })).data,
        onSuccess: changed,
    });
}

/** A new role; their personal permission changes are cleared (employee:manage). */
export function useChangeRole(userId: number) {
    const changed = useAccountChanged();
    return useMutation({
        mutationFn: async (body: Schemas["ChangeRoleRequest"]) => (await http.put<Employee>(`/employees/${userId}/role`, body)).data,
        onSuccess: changed,
    });
}

/** Moves them to the other business, into one of its teams or none (employee:manage). */
export function useMoveEmployee(userId: number) {
    const changed = useAccountChanged();
    return useMutation({
        mutationFn: async (body: Schemas["MoveEmployeeRequest"]) => (await http.put<Employee>(`/employees/${userId}/domain`, body)).data,
        onSuccess: changed,
    });
}

/** Emails a fresh sign-up link; the old one stops working (employee:invite). */
export function useResendInvitation(userId: number) {
    return useMutation({
        mutationFn: async () => (await http.post<Schemas["InvitationResponse"]>(`/invitations/${userId}/resend`)).data,
    });
}

export function useUpdateMyProfile() {
    const changed = usePeopleChanged();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateMyProfileRequest"]) => (await http.put(`/me/profile`, body)).data,
        onSuccess: changed,
    });
}

/** Sets or removes a photo: the person's own (`me`), or someone's (employee:manage). */
export function useSetPhoto(userId: number | "me") {
    const changed = usePeopleChanged();
    const path = userId === "me" ? "/me/photo" : `/employees/${userId}/photo`;
    return useMutation({
        mutationFn: async (fileId: number | null) => (fileId == null ? await http.delete(path) : await http.put(path, { fileId })).data,
        onSuccess: changed,
    });
}

export function useChangePay(userId: number) {
    const changed = usePeopleChanged();
    return useMutation({
        mutationFn: async (body: Schemas["ChangePayRequest"]) => (await http.post<Pay>(`/employees/${userId}/pay`, body)).data,
        onSuccess: changed,
    });
}
