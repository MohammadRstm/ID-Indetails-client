import { useLocation } from "react-router";
import type { Schemas } from "@/api/types";
import { useOpenSurface } from "@/shared/components/Overlays/assistantLayer";
import { SURFACES } from "./surfaces";

export type ProtonPageContext = Schemas["ProtonPageContext"];

type Page = NonNullable<Schemas["ProtonPage"]>;
type Section = NonNullable<Schemas["ProtonProjectSection"]>;

const DOMAIN_PAGES: Record<string, Page> = {
    overview: "dashboard", projects: "projects", clients: "clients", people: "people",
    financials: "financials", meetings: "meetings", activity: "activity", reports: "reports",
    settings: "settings", notifications: "notifications", messages: "messages", help: "help",
    "my-work": "my_work", pay: "my_pay", profile: "my_profile",
};
const COMPANY_PAGES: Record<string, Page> = {
    "": "launcher", overview: "company_overview", overhead: "company_expenses", schedules: "schedules", salaries: "salaries",
    "project-pay": "project_pay", proton: "proton_budget", settings: "company_settings", profile: "company_profile",
    notifications: "notifications", messages: "messages", help: "help",
};
const RECORDS: Record<string, Schemas["ProtonRefType"]> = { projects: "project", clients: "client", people: "person" };
const SECTIONS: readonly Section[] = ["financials", "overview", "analytics", "contributors", "requirements", "timeline", "meetings"];

/**
 * Where a path is, by meaning: area, page, the record and tab it shows, and the known window open on it. Nothing else
 * of the page is sent: no field, no value.
 */
export function pageContextOf(pathname: string, search: string, surface: string | null = null): ProtonPageContext | null {
    const [area, page, id] = pathname.split("/").filter(Boolean);
    if (area !== "design" && area !== "execution" && area !== "company") return null;
    const known = (area === "company" ? COMPANY_PAGES : DOMAIN_PAGES)[page ?? ""] ?? null;
    const entityType = area !== "company" && id && /^\d+$/.test(id) ? RECORDS[page ?? ""] ?? null : null;
    const query = new URLSearchParams(search);
    const tab = query.get("tab");
    // an open chat, by id only: who it is with, or which team
    const chat = known === "messages" ? ([["person", query.get("with")], ["team", query.get("group")]] as const).find(([, v]) => v && /^\d+$/.test(v)) : undefined;
    return {
        area,
        page: known,
        entityType: chat ? chat[0] : entityType,
        entityId: chat ? Number(chat[1]) : entityType ? Number(id) : null,
        section: entityType === "project" && SECTIONS.includes(tab as Section) ? (tab as Section) : null,
        surface: surface != null && Object.hasOwn(SURFACES, surface) ? (surface as keyof typeof SURFACES) : null,
    };
}

/** The page the person is on now, sent with each question so "it" and "this project" make sense to Proton. */
export function useProtonPageContext(): ProtonPageContext | null {
    const { pathname, search } = useLocation();
    return pageContextOf(pathname, search, useOpenSurface());
}
