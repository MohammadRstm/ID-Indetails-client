import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen, companyRoutes } from "@/app/routing/routeTable";
import { useArea } from "@/app/shell/useArea";
import { openLogWork } from "@/domains/design/work/logWorkStore";
import { setMessageSounds } from "@/domains/shared/messages/messageSounds";
import { markAssistantOpening, runOpener } from "@/shared/components/Overlays/assistantLayer";
import { setTheme } from "@/shared/theme";
import { chatOf, fillForm, setDraft, type FormFill } from "./formFill";
import { SURFACES } from "./surfaces";

export type ProtonUiCommand = Schemas["ProtonUiCommand"];

/**
 * What a command turns into here: a route of this app, a window a page opens itself, the log work window, a
 * display choice, a refresh, or nothing at all.
 */
export type UiStep =
    | { kind: "go"; path: string; label: string }
    | { kind: "opener"; id: string; label: string }
    | { kind: "log_work"; label: string }
    | { kind: "fill"; fill: FormFill }
    | { kind: "draft"; path: string; chat: string; body: string; label: string }
    | { kind: "theme"; theme: "light" | "dark" }
    | { kind: "sounds"; on: boolean }
    | { kind: "refresh" };

const DOMAINS: readonly Domain[] = ["design", "execution"];
const SECTIONS = { requirements: "requirements", timeline: "timeline", meetings: "meetings" } as const;
const TABS = ["overview", "projects", "clients", "billing", "costs"] as const;

/** The values object each form takes in a fill: a fill naming one form with another's values is dropped. */
const FILLS: Record<FormFill["form"], keyof FormFill> = {
    client: "client", meeting: "meeting", new_project: "newProject", edit_project: "editProject", report_bug: "reportBug", invite: "invite", message: "message", log_work: "logWork",
};

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
    settings: { path: "settings" },
    notifications: { path: "notifications" },
    messages: { path: "messages" },
    help: { path: "help" },
    schedules: { path: "schedules", company: true },
    salaries: { path: "salaries", company: true },
    project_pay: { path: "project-pay", company: true },
    proton_budget: { path: "proton", company: true },
    company_settings: { path: "settings", company: true },
    company_profile: { path: "profile", company: true },
    // the start page, where every signed-in person may go
    launcher: { path: "", company: true },
    // the person's own pages, in their domain
    my_work: { path: "my-work" },
    my_pay: { path: "pay" },
    my_profile: { path: "profile" },
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
            if (c.page === "launcher") return { kind: "go", path: "/company", label };
            if (page.company) {
                return companyRoutes.find((r) => r.path === page.path)?.access(p) ? { kind: "go", path: `/company/${page.path}`, label } : null;
            }
            if (!visible(c.domain)) return null;
            const query = c.page === "projects" && isId(c.clientId) ? `?client=${c.clientId}`
                : c.page === "financials" && has(TABS, c.tab) ? `?tab=${c.tab}`
                : "";
            return domainPath(c.domain, `${page.path}${query}`);
        }
        case "open_surface": {
            if (!has(SURFACES, c.surface)) return null;
            const domain = c.domain == null ? null : visible(c.domain) ? c.domain : undefined;
            if (domain === undefined) return null;
            const target = SURFACES[c.surface]({
                p, domain: domain ?? current, id: isId(c.id) ? c.id : null,
                section: typeof c.settingsSection === "string" ? c.settingsSection : null,
                tab: typeof c.companyTab === "string" ? c.companyTab : null,
            });
            if (!target) return null;
            return target.kind === "go" ? { kind: "go", path: target.path, label }
                : target.kind === "opener" ? { kind: "opener", id: target.id, label }
                : { kind: "log_work", label };
        }
        case "fill_form": {
            const fill = c.fill as FormFill | null | undefined;
            if (!fill || !has(FILLS, fill.form) || fill[FILLS[fill.form]] == null) return null;
            if (fill.form !== "message") return { kind: "fill", fill };
            // a draft opens its chat, then waits in the composer for the person to send
            const team = c.surface === "message_team";
            if (!isId(fill.id) || (!team && c.surface !== "message_person")) return null;
            const domain = c.domain == null ? current : visible(c.domain) ? c.domain : null;
            const target = SURFACES[team ? "message_team" : "message_person"]({ p, domain, id: fill.id, section: null, tab: null });
            return target?.kind === "go" ? { kind: "draft", path: target.path, chat: chatOf(team, fill.id), body: fill.message!.body, label } : null;
        }
        case "set_preference":
            if (c.theme === "light" || c.theme === "dark") return { kind: "theme", theme: c.theme };
            if (typeof c.sounds === "boolean") return { kind: "sounds", on: c.sounds };
            return null;
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
        // the API sends at most one place, then the display choices: run them in that order
        const done: string[] = [];
        for (const command of commands.slice(0, 3)) {
            const step = stepOf(command, p, current);
            if (!step) {
                done.push("That couldn't be opened here.");
                continue;
            }

            switch (step.kind) {
                case "go":
                    // a window that opens on the way doesn't take the keyboard from the person
                    markAssistantOpening();
                    navigate(step.path);
                    done.push(`Opened ${step.label}.`);
                    break;
                case "opener":
                    markAssistantOpening();
                    done.push(runOpener(step.id) ? `Opened ${step.label}.` : "That couldn't be opened here.");
                    break;
                case "log_work":
                    markAssistantOpening();
                    openLogWork();
                    done.push(`Opened ${step.label}.`);
                    break;
                case "fill":
                    done.push(fillForm(step.fill));
                    break;
                case "draft":
                    markAssistantOpening();
                    setDraft(step.chat, step.body);
                    navigate(step.path);
                    done.push(`Wrote ${step.label}: read it, then press Send.`);
                    break;
                case "theme":
                    setTheme(step.theme);
                    done.push(step.theme === "dark" ? "Switched to dark mode." : "Switched to light mode.");
                    break;
                case "sounds":
                    setMessageSounds(step.on);
                    done.push(step.on ? "Message sounds are on." : "Message sounds are off.");
                    break;
                case "refresh":
                    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "proton" });
                    done.push("Refreshed this page.");
                    break;
            }
        }

        return [...new Set(done)].join(" ");
    }, [navigate, queryClient, p, current]);
}
