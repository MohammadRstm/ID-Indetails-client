import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen, companyRoutes } from "@/app/routing/routeTable";
import { useArea } from "@/app/shell/useArea";

export type ProtonUiCommand = Schemas["ProtonUiCommand"];

/** What a command turns into here: a route of this app, a refresh, or nothing at all. */
export type UiStep = { kind: "go"; path: string; label: string } | { kind: "refresh" };

const DOMAINS: readonly Domain[] = ["design", "execution"];
const SECTIONS = { requirements: "requirements", timeline: "timeline", meetings: "meetings" } as const;
const TABS = ["overview", "projects", "clients", "billing", "costs"] as const;

/** Every page Proton may name, and where it lives here. The company ones are checked against the company routes. */
const PAGES: Record<NonNullable<Schemas["ProtonPage"]>, { path: string; company?: true }> = {
    dashboard: { path: "overview" },
    projects: { path: "projects" },
    clients: { path: "clients" },
    people: { path: "people" },
    financials: { path: "financials" },
    meetings: { path: "meetings" },
    activity: { path: "activity" },
    reports: { path: "reports" },
    company_overview: { path: "overview", company: true },
    company_expenses: { path: "overhead", company: true },
};

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const has = <T extends string>(list: readonly T[] | Record<T, unknown>, v: unknown): v is T =>
    typeof v === "string" && (Array.isArray(list) ? list.includes(v as T) : Object.hasOwn(list, v));

/**
 * Turns one command from the API into a step, or null. Nothing is taken on trust: an unknown type, a bad id, a domain
 * this person can't see, or a page their own route access refuses all give null. Routes are built here, from this
 * app's own route table; the API never sends an address.
 */
export function stepOf(command: unknown, p: Permissions, current: Domain | null): UiStep | null {
    if (typeof command !== "object" || command === null) return null;
    const c = command as Record<string, unknown>;
    const label = typeof c.label === "string" ? c.label : "";
    const domainPath = (domain: Domain, path: string): UiStep | null =>
        canOpen(p, domain, path) ? { kind: "go", path: `/${domain}/${path}`, label } : null;
    const visible = (d: unknown): d is Domain => has(DOMAINS, d) && p.canSeeDomain(d);

    switch (c.type) {
        case "refresh":
            return { kind: "refresh" };
        case "open_project": {
            if (!isId(c.id) || !visible(c.domain)) return null;
            const tab = c.section != null && has(SECTIONS, c.section) ? `?tab=${SECTIONS[c.section]}` : "";
            return domainPath(c.domain, `projects/${c.id}${tab}`);
        }
        case "open_client":
            return isId(c.id) && visible(c.domain) ? domainPath(c.domain, `clients/${c.id}`) : null;
        case "open_person": {
            // company-wide people have no domain of their own: they open in the area the person is in
            const domain = c.domain == null ? current ?? p.visibleDomains[0] : c.domain;
            return isId(c.id) && visible(domain) ? domainPath(domain, `people/${c.id}`) : null;
        }
        case "open_page": {
            if (!has(PAGES, c.page)) return null;
            const page = PAGES[c.page];
            if (page.company) {
                return companyRoutes.find((r) => r.path === page.path)?.access(p) ? { kind: "go", path: `/company/${page.path}`, label } : null;
            }
            if (!visible(c.domain)) return null;
            const query = c.page === "projects" && isId(c.clientId) ? `?client=${c.clientId}`
                : c.page === "financials" && has(TABS, c.tab) ? `?tab=${c.tab}`
                : "";
            return domainPath(c.domain, `${page.path}${query}`);
        }
        default:
            return null;
    }
}

/**
 * Runs the commands of a reply or a confirmed action: one navigation at most, as the API sends them. Returns what was
 * done, in words, for a line in the chat (or that something couldn't be opened here).
 */
export function useRunProtonCommands() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const p = usePermissions();
    const area = useArea();
    const current = area.kind === "domain" ? area.domain : null;

    return useCallback((commands: unknown): string | null => {
        if (!Array.isArray(commands) || commands.length === 0) return null;
        const steps = commands.slice(0, 2).map((c) => stepOf(c, p, current));
        const go = steps.find((s) => s?.kind === "go");
        if (go?.kind === "go") {
            navigate(go.path);
            return `Opened ${go.label}.`;
        }
        if (steps.some((s) => s?.kind === "refresh")) {
            void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "proton" });
            return "Refreshed this page.";
        }
        return "That couldn't be opened here.";
    }, [navigate, queryClient, p, current]);
}
