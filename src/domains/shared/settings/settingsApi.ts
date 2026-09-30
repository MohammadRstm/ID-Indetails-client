import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type DomainSettings = Schemas["DomainSettingsResponse"];
export type CompanySettings = Schemas["CompanySettingsResponse"];
export type WorkingTime = Schemas["WorkingTimeResponse"];
export type WorkingTimePolicy = Schemas["WorkingTimePolicyResponse"];
export type ExchangeRate = Schemas["ExchangeRateResponse"];
export type Team = Schemas["TeamResponse"];
export type UserPermissions = Schemas["UserPermissionsResponse"];
export type PermissionDefinition = Schemas["PermissionDefinitionResponse"];

/*
 * Settings live in four places in the API: the company's (name, logo, week, currency), the company's
 * working time (hours, break, overtime), each domain's rules (time tracking, projects, notifications)
 * and each domain's billing (terms, numbering, bank details). Saving one refreshes whatever reads it.
 */

/** The domain's time-tracking, project and notification rules, read with useDomainSettings (domain_settings:manage). */
export function useSaveDomainRules(domain: string) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["SaveDomainSettingsRequest"]) => (await http.put<DomainSettings>(`/domain-settings/${domain}`, body)).data,
        onSuccess: () => invalidate(keys.settings.domain(domain), keys.projects.all),
    });
}

/** Name, address, website, week, time format and currency (company_settings:manage). */
export function useSaveCompanySettings() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateCompanySettingsRequest"]) => (await http.put<CompanySettings>("/company/settings", body)).data,
        onSuccess: () => invalidate(["company"]),
    });
}

/** A new logo from an uploaded file, or null for Hourline's mark (company_settings:manage). */
export function useSetLogo() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (fileId: number | null) =>
            (fileId == null ? await http.delete<CompanySettings>("/company/logo") : await http.put<CompanySettings>("/company/logo", { fileId })).data,
        onSuccess: () => invalidate(["company"]),
    });
}

const workingTimeKey = ["company", "working-time"] as const;

/** The company week, break and overtime rate in force, and every version of them. */
export function useWorkingTime() {
    return useQuery({
        queryKey: workingTimeKey,
        queryFn: async () => (await http.get<WorkingTime>("/company/working-time")).data,
    });
}

/** A new version of the working time, from a day (working_time:manage). Hours, overtime and pay follow it. */
export function useSetWorkingTime() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["SetWorkingTimeRequest"]) => (await http.post<WorkingTime>("/company/working-time", body)).data,
        onSuccess: () => invalidate(workingTimeKey, keys.work.all, keys.employees.all, keys.finance.all),
    });
}

/** Terms, numbering, bank details and the words on every invoice (billing_settings:manage). */
export function useSaveBillingSettings(domain: string) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["SaveBillingSettingsRequest"]) =>
            (await http.put<Schemas["BillingSettingsResponse"]>(`/billing-settings/${domain}`, body)).data,
        onSuccess: () => invalidate(["billing-settings", domain]),
    });
}

/** Every rate set for a currency, newest first (financial:view). */
export function useExchangeRates(currency: string, enabled: boolean) {
    return useQuery({
        queryKey: ["exchange-rates", currency, "all"],
        queryFn: async () => (await http.get<ExchangeRate[]>("/exchange-rates", { params: { currency } })).data,
        enabled,
    });
}

/** A rate from a day on (exchange_rate:manage). Payments already recorded keep theirs. */
export function useAddExchangeRate() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["AddExchangeRateRequest"]) => (await http.post<ExchangeRate>("/exchange-rates", body)).data,
        onSuccess: () => invalidate(["exchange-rates"]),
    });
}

/** Admins and super admins the viewer can see. */
export function useAdmins(domain: string | null) {
    return useQuery({
        queryKey: [...keys.employees.all, "admins", domain],
        queryFn: async () => {
            const list = async (role: string) =>
                (await http.get<Paged<Schemas["EmployeeSummaryResponse"]>>("/employees", { params: { role, pageSize: 100, ...(domain ? { domain } : {}) } })).data.items;
            const [supers, admins] = await Promise.all([list("super_admin"), list("admin")]);
            return [...supers, ...admins].filter((p) => p.status !== "deactivated");
        },
    });
}

const teamsKey = ["teams"] as const;

export function useSaveTeam() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, name, domain }: { id: number | null; name: string; domain: string }) =>
            (id == null ? await http.post<Team>("/teams", { name, domainCode: domain }) : await http.put<Team>(`/teams/${id}`, { name })).data,
        onSuccess: () => invalidate(teamsKey, keys.employees.all),
    });
}

export function useDeleteTeam() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/teams/${id}`); },
        onSuccess: () => invalidate(teamsKey, keys.employees.all),
    });
}

/** Every permission there is, with who holds it by default (permission:manage). */
export function usePermissionCatalog(enabled: boolean) {
    return useQuery({
        queryKey: ["permissions", "catalog"],
        queryFn: async () => (await http.get<PermissionDefinition[]>("/permissions")).data,
        enabled,
        staleTime: 30 * 60_000,
    });
}

/** Someone's permissions: their role's defaults, the overrides on top, and what they hold (permission:manage). */
export function useUserPermissions(userId: number, enabled: boolean) {
    return useQuery({
        queryKey: ["permissions", "user", userId],
        queryFn: async () => (await http.get<UserPermissions>(`/users/${userId}/permissions`)).data,
        enabled,
    });
}

export function useUpdateUserPermissions(userId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (changes: Schemas["PermissionChangeRequest"][]) =>
            (await http.put<UserPermissions>(`/users/${userId}/permissions`, { changes })).data,
        onSuccess: () => invalidate(["permissions", "user", userId], keys.employees.all),
    });
}
