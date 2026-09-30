import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { http } from "@/api/http";
import type { Paged, Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { setFormatSettings } from "@/shared/format/time";

type CompanySettings = Schemas["CompanySettingsResponse"];

/** The company settings every page formats with (time zone, 24-hour clock, week start). */
export function useCompanySettings() {
    const query = useQuery({
        queryKey: ["company", "settings"],
        queryFn: async () => (await http.get<CompanySettings>("/company/settings")).data,
        staleTime: 10 * 60_000,
    });

    useEffect(() => {
        if (!query.data) return;
        setFormatSettings({
            timeZone: query.data.timeZone,
            use24HourTime: query.data.use24HourTime,
            weekStart: query.data.weekStart,
        });
    }, [query.data]);

    return query;
}

async function countOf(url: string, params: Record<string, unknown>): Promise<number> {
    const { data } = await http.get<Paged<unknown>>(url, { params: { ...params, page: 1, pageSize: 1 } });
    return data.totalCount;
}

/** The counts beside Projects, Clients and Employees in an admin's sidebar. */
export function useNavCounts(domain: Domain | null, p: Permissions) {
    const enabled = domain != null && p.isAdmin;
    const projects = useQuery({
        queryKey: ["projects", "count", domain],
        queryFn: () => countOf("/projects", { domain, status: "active" }),
        enabled: enabled && p.has(P.PROJECT_VIEW),
        staleTime: 5 * 60_000,
    });
    const clients = useQuery({
        queryKey: ["clients", "count", domain],
        queryFn: () => countOf("/clients", { domain }),
        enabled: enabled && p.has(P.CLIENT_VIEW),
        staleTime: 5 * 60_000,
    });
    const people = useQuery({
        queryKey: ["employees", "count", domain],
        queryFn: () => countOf("/employees", { domain, status: "active" }),
        enabled: enabled && p.has(P.EMPLOYEE_VIEW),
        staleTime: 5 * 60_000,
    });
    return { projects: projects.data, clients: clients.data, people: people.data };
}

// Until live updates arrive (phase 8), the badges are refreshed every minute.
const BADGE_MS = 60_000;

export function useUnreadBadges() {
    const notifications = useQuery({
        queryKey: ["notifications", "unread"],
        queryFn: async () => (await http.get<Schemas["UnreadCountResponse"]>("/notifications/unread-count")).data.unread,
        refetchInterval: BADGE_MS,
    });
    const messages = useQuery({
        queryKey: ["messages", "badge"],
        queryFn: async () => (await http.get<Schemas["MessagesBadgeResponse"]>("/messages/badge")).data,
        refetchInterval: BADGE_MS,
    });
    return { notifications: notifications.data ?? 0, messages: messages.data };
}
