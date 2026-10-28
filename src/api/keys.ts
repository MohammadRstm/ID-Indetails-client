import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback } from "react";

/*
 * Every query key starts with its area ("projects", "clients", …), so a change can refresh an area, or one
 * record in it, by prefix. Mutations list what they touch with useInvalidate.
 */

export const keys = {
    projects: {
        all: ["projects"] as const,
        list: (params: object) => ["projects", "list", params] as const,
        totals: (params: object) => ["projects", "totals", params] as const,
        counts: (domain: string) => ["projects", "counts", domain] as const,
        detail: (id: number) => ["projects", "detail", id] as const,
    },
    requirements: {
        all: ["requirements"] as const,
        project: (projectId: number) => ["requirements", projectId] as const,
        mine: ["requirements", "mine"] as const,
    },
    meetings: {
        all: ["meetings"] as const,
        list: (params: object) => ["meetings", "list", params] as const,
        project: (projectId: number) => ["meetings", "project", projectId] as const,
    },
    clients: {
        all: ["clients"] as const,
        list: (params: object) => ["clients", "list", params] as const,
        overview: (domain: string) => ["clients", "overview", domain] as const,
        detail: (id: number) => ["clients", "detail", id] as const,
    },
    employees: {
        all: ["employees"] as const,
        list: (params: object) => ["employees", "list", params] as const,
    },
    box: {
        all: ["box"] as const,
        summary: () => ["box", "summary"] as const,
        entries: (params: object) => ["box", "entries", params] as const,
    },
    finance: {
        all: ["finance"] as const,
        summary: (domain: string, params: object) => ["finance", domain, "summary", params] as const,
        clients: (domain: string) => ["finance", domain, "clients"] as const,
        monthly: (domain: string, months: number) => ["finance", domain, "monthly", months] as const,
        projects: (domain: string) => ["finance", domain, "projects"] as const,
        billing: (domain: string, months: number) => ["finance", domain, "billing", months] as const,
        attention: (domain: string) => ["finance", domain, "attention"] as const,
        costs: (domain: string, params: object) => ["finance", domain, "costs", params] as const,
    },
    /** A person's own work: their day, entries, summaries, overtime, hours and pay. */
    work: {
        all: ["work"] as const,
        myProjects: ["work", "projects"] as const,
        myProject: (projectId: number) => ["work", "project", projectId] as const,
        day: (date: string) => ["work", "day", date] as const,
        schedule: (date: string) => ["work", "schedule", date] as const,
        summary: (params: object) => ["work", "summary", params] as const,
        entries: (params: object) => ["work", "entries", params] as const,
        overtime: (month: string) => ["work", "overtime", month] as const,
        preview: (body: object) => ["work", "preview", body] as const,
        hours: ["work", "hours"] as const,
        requirements: ["work", "requirements"] as const,
        /** Reports are built from logged work, so they refresh with it. */
        report: (params: object) => ["work", "report", params] as const,
        reportEntries: (params: object) => ["work", "report-entries", params] as const,
    },
    settings: {
        domain: (domain: string) => ["settings", "domain", domain] as const,
    },
    activity: { all: ["activity"] as const },
    dashboard: {
        all: ["dashboard"] as const,
        overview: (period: string) => ["dashboard", "overview", period] as const,
        domain: (domain: string) => ["dashboard", domain] as const,
        deadlines: (domain: string) => ["dashboard", domain, "deadlines"] as const,
    },
    search: (q: string) => ["search", q] as const,
};

/** Refreshes every query under these prefixes (active ones refetch now, the rest when next shown). */
export function useInvalidate() {
    const queryClient = useQueryClient();
    return useCallback(
        (...prefixes: QueryKey[]) => Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
        [queryClient],
    );
}
