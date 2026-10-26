import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen, companyRoutes, websiteRoutes } from "@/app/routing/routeTable";
import { useArea } from "@/app/shell/useArea";
import { openLogWork } from "@/domains/design/work/logWorkStore";
import { setMessageSounds } from "@/domains/shared/messages/messageSounds";
import { markAssistantOpening, runOpener } from "@/shared/components/Overlays/assistantLayer";
import { setTheme } from "@/shared/theme";
import { chatOf, fillForm, isFormOpen, setDraft, type FormFill } from "./formFill";
import { placeOf } from "./formPlaces";
import type { SurfaceTarget } from "./surfaces";
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
    /** `place`: where the form lives, opened first when it isn't open yet (null: the person can't open it here). */
    | { kind: "fill"; fill: FormFill; place: SurfaceTarget | null }
    | { kind: "draft"; path: string; chat: string; body: string; label: string }
    | { kind: "theme"; theme: "light" | "dark" }
    | { kind: "sounds"; on: boolean }
    | { kind: "refresh" };

const DOMAINS: readonly Domain[] = ["design", "execution"];
/** A project page's tabs Proton may name; the page itself falls back to the person's first tab for one they don't have. */
const SECTIONS = {
    financials: "financials", overview: "overview", analytics: "analytics", contributors: "contributors",
    requirements: "requirements", timeline: "timeline", meetings: "meetings", files: "files", portal: "portal",
} as const;
/** The parts of the files and client portal tabs: their sections, and on the portal the client's access and the discussion. */
const FILE_PARTS = ["presentation", "model", "drawing"] as const;
const PORTAL_PARTS = [...FILE_PARTS, "access", "discussion"] as const;
const TABS = ["overview", "projects", "clients", "billing", "costs"] as const;

/** The values object each form takes in a fill: a fill naming one form with another's values is dropped. */
const FILLS: Record<FormFill["form"], keyof FormFill> = {
    client: "client", meeting: "meeting", new_project: "newProject", edit_project: "editProject", report_bug: "reportBug", invite: "invite", message: "message", log_work: "logWork",
    requirement: "requirement", work_entry_comment: "workEntryComment", report_options: "reportOptions", team: "team", profile: "profile",
    file_rename: "fileRename", file_comment: "fileComment", portal_intro: "portalIntro", portal_message: "portalMessage",
    website_project: "websiteProject", website_service: "websiteService", website_location: "websiteLocation", website_social_link: "websiteSocialLink",
    company_details: "companyDetails", company_expense: "companyExpense", materials: "materials", invoice: "invoice", payment: "payment",
    project_expense: "projectExpense", labour_week: "labourWeek", schedule: "schedule", hour_excuse: "hourExcuse",
};

/**
 * Every page Proton may name, and where it lives here. The company ones are checked against the company routes, the
 * Website ones against the Website area's.
 */
const PAGES: Record<NonNullable<Schemas["ProtonPage"]>, { path: string; company?: true; website?: true }> = {
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
    // the Website area: no business of its own
    website_projects: { path: "projects", website: true },
    website_analytics: { path: "analytics", website: true },
    website_services: { path: "services", website: true },
    website_locations: { path: "locations", website: true },
    website_contact: { path: "contact", website: true },
    website_site: { path: "site", website: true },
    website_staff: { path: "staff", website: true },
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
            const section = c.section != null && has(SECTIONS, c.section) ? SECTIONS[c.section] : null;
            const parts: readonly string[] = section === "files" ? FILE_PARTS : section === "portal" ? PORTAL_PARTS : [];
            const part = has(parts, c.part) ? `&part=${c.part}` : "";
            return domainPath(c.domain, `projects/${c.id}${section ? `?tab=${section}${part}` : ""}`);
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
            if (page.website) {
                return p.hasWebsiteArea && websiteRoutes.find((r) => r.path === page.path)?.access(p) ? { kind: "go", path: `/website/${page.path}`, label } : null;
            }
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
            // the Website area is no business: its surfaces check it themselves, and a business's never opens there
            const website = c.domain === "website";
            const domain = c.domain == null || website ? null : visible(c.domain) ? c.domain : undefined;
            if (domain === undefined || (website && !p.hasWebsiteArea)) return null;
            const target = SURFACES[c.surface]({
                p, domain: website ? null : domain ?? current, id: isId(c.id) ? c.id : null,
                section: typeof c.settingsSection === "string" ? c.settingsSection : null,
                tab: typeof c.companyTab === "string" ? c.companyTab : null,
                itemId: isId(c.itemId) ? c.itemId : null,
            });
            if (!target) return null;
            return target.kind === "go" ? { kind: "go", path: target.path, label }
                : target.kind === "opener" ? { kind: "opener", id: target.id, label }
                : { kind: "log_work", label };
        }
        case "fill_form": {
            const fill = c.fill as FormFill | null | undefined;
            if (!fill || !has(FILLS, fill.form) || fill[FILLS[fill.form]] == null) return null;
            if (fill.form !== "message") {
                const at = { id: isId(c.id) ? c.id : null, domain: c.domain == null ? null : visible(c.domain) ? c.domain : undefined };
                // a business this person can't see: the form isn't theirs to open
                if (at.domain === undefined) return null;
                return { kind: "fill", fill, place: placeOf(fill, { id: at.id, domain: at.domain }, p, current) };
            }
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

/** The most a reply carries (ProtonUiCommand.Pick): a place, a fill, the theme and the sounds. */
const MAX_COMMANDS = 4;

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

    /** `report`: where a fill that waited for its form says, later, what became of it. */
    return useCallback((commands: unknown, report?: (message: string) => void): string | null => {
        if (!Array.isArray(commands) || commands.length === 0) return null;
        // the API sends at most one place, a fill, then the display choices (theme, sounds): run them in that order
        const done: string[] = [];
        let moved = false;
        for (const command of commands.slice(0, MAX_COMMANDS)) {
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
                    moved = true;
                    done.push(`Opened ${step.label}.`);
                    break;
                case "opener":
                    markAssistantOpening();
                    moved = true;
                    done.push(runOpener(step.id) ? `Opened ${step.label}.` : "That couldn't be opened here.");
                    break;
                case "log_work":
                    markAssistantOpening();
                    openLogWork();
                    moved = true;
                    done.push(`Opened ${step.label}.`);
                    break;
                case "fill":
                    // the form opens itself when the answer didn't open it: its own link, as a person would follow it
                    if (!moved && !isFormOpen(step.fill) && step.place) {
                        markAssistantOpening();
                        if (step.place.kind === "go") navigate(step.place.path);
                        else if (step.place.kind === "opener") runOpener(step.place.id);
                        else openLogWork();
                        moved = true;
                    }

                    done.push(fillForm(step.fill, { afterMove: moved, report }));
                    break;
                case "draft":
                    markAssistantOpening();
                    setDraft(step.chat, step.body);
                    navigate(step.path);
                    moved = true;
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
