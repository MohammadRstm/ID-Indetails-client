import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { setFormatSettings, type FormatSettings } from "@/shared/format/time";

type CompanySettings = Schemas["CompanySettingsResponse"];

const FORMATS_KEY = "hourline-company-formats";

/** The formats the last visit in this browser saw; null on a first visit, or when site data is blocked. */
function rememberedFormats(): FormatSettings | null {
    try {
        const raw = localStorage.getItem(FORMATS_KEY);
        return raw ? (JSON.parse(raw) as FormatSettings) : null;
    } catch {
        return null;
    }
}

// Set before any page renders: the first page needn't wait for the settings to load. They change rarely, and the
// shell renders again with the new ones when they arrive.
const lastFormats = rememberedFormats();
if (lastFormats) setFormatSettings(lastFormats);

/** Whether the formats are known before the settings load: from the last visit in this browser. */
export const formatsRemembered = lastFormats !== null;

/** The company settings every page formats with (time zone, 24-hour clock, week start). */
export function useCompanySettings() {
    const query = useQuery({
        queryKey: ["company", "settings"],
        queryFn: async () => (await http.get<CompanySettings>("/company/settings")).data,
        staleTime: 10 * 60_000,
    });

    // set while rendering, not after: the page under the shell waits for these (AppShell) and must render with
    // the company's clock and week from its very first render
    const formats: FormatSettings | null = query.data
        ? { timeZone: query.data.timeZone, use24HourTime: query.data.use24HourTime, weekStart: query.data.weekStart }
        : null;
    if (formats) setFormatSettings(formats);

    const remembered = formats && JSON.stringify(formats);
    useEffect(() => {
        if (!remembered) return;
        try {
            localStorage.setItem(FORMATS_KEY, remembered);
        } catch {
            // blocked site data: the next visit waits for the settings again
        }
    }, [remembered]);

    return query;
}

type NavCounts = Schemas["NavCountsResponse"];

const counting = new Map<string, Promise<NavCounts>>();

/**
 * The sidebar's three counts come from one request. Each stays its own query, under its list's key, so a change to
 * projects refreshes the projects count as before; the queries that start together share the request.
 */
function navCount(domain: string, pick: (counts: NavCounts) => number | null | undefined): Promise<number> {
    let request = counting.get(domain);
    if (!request) {
        request = http.get<NavCounts>("/search/counts", { params: { domain } }).then((r) => r.data);
        counting.set(domain, request);
        void request.finally(() => counting.delete(domain)).catch(() => undefined);
    }
    return request.then((counts) => pick(counts) ?? 0);
}

/** The counts beside Projects, Clients and Employees in the sidebar, each for whoever may see that list. */
export function useNavCounts(domain: Domain | null, p: Permissions) {
    const enabled = domain != null;
    const projects = useQuery({
        queryKey: ["projects", "count", domain],
        queryFn: () => navCount(domain!, (c) => c.projects),
        enabled: enabled && p.has(P.PROJECT_VIEW),
        staleTime: 5 * 60_000,
    });
    const clients = useQuery({
        queryKey: ["clients", "count", domain],
        queryFn: () => navCount(domain!, (c) => c.clients),
        enabled: enabled && p.has(P.CLIENT_VIEW),
        staleTime: 5 * 60_000,
    });
    const people = useQuery({
        queryKey: ["employees", "count", domain],
        queryFn: () => navCount(domain!, (c) => c.people),
        enabled: enabled && p.has(P.EMPLOYEE_VIEW),
        staleTime: 5 * 60_000,
    });
    return { projects: projects.data, clients: clients.data, people: people.data };
}

/** The bell's and the chat icon's counts; the live connection refreshes them when they change. */
export function useUnreadBadges() {
    const notifications = useQuery({
        queryKey: ["notifications", "unread"],
        queryFn: async () => (await http.get<Schemas["UnreadCountResponse"]>("/notifications/unread-count")).data.unread,
    });
    const messages = useQuery({
        queryKey: ["messages", "badge"],
        queryFn: async () => (await http.get<Schemas["MessagesBadgeResponse"]>("/messages/badge")).data,
    });
    return { notifications: notifications.data ?? 0, notificationsLoaded: notifications.data != null, messages: messages.data };
}
