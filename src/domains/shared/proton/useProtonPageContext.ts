import { useLocation } from "react-router";
import type { Schemas } from "@/api/types";

export type ProtonPageContext = Schemas["ProtonPageContext"];

type Page = NonNullable<Schemas["ProtonPage"]>;
type Section = NonNullable<Schemas["ProtonProjectSection"]>;

const DOMAIN_PAGES: Record<string, Page> = {
    overview: "dashboard", projects: "projects", clients: "clients", people: "people",
    financials: "financials", meetings: "meetings", activity: "activity", reports: "reports",
};
const COMPANY_PAGES: Record<string, Page> = { overview: "company_overview", overhead: "company_expenses" };
const RECORDS: Record<string, Schemas["ProtonRefType"]> = { projects: "project", clients: "client", people: "person" };
const SECTIONS: readonly Section[] = ["requirements", "timeline", "meetings"];

/** Where a path is, by meaning: area, page, and the record and tab it shows. Nothing else of the page is sent. */
export function pageContextOf(pathname: string, search: string): ProtonPageContext | null {
    const [area, page, id] = pathname.split("/").filter(Boolean);
    if (area !== "design" && area !== "execution" && area !== "company") return null;
    const known = (area === "company" ? COMPANY_PAGES : DOMAIN_PAGES)[page ?? ""] ?? null;
    const entityType = area !== "company" && id && /^\d+$/.test(id) ? RECORDS[page ?? ""] ?? null : null;
    const tab = new URLSearchParams(search).get("tab");
    return {
        area,
        page: known,
        entityType,
        entityId: entityType ? Number(id) : null,
        section: entityType === "project" && SECTIONS.includes(tab as Section) ? (tab as Section) : null,
    };
}

/** The page the person is on now, sent with each question so "it" and "this project" make sense to Proton. */
export function useProtonPageContext(): ProtonPageContext | null {
    const { pathname, search } = useLocation();
    return pageContextOf(pathname, search);
}
