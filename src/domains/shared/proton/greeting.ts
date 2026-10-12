import { P } from "@/app/permissions/codes";
import type { Permissions } from "@/app/permissions/permissions";
import type { ProtonPageContext } from "./useProtonPageContext";

const MAX = 3;

/**
 * A few questions to start with, for the page the person is on: written here, never by the model, and only ones
 * whose answer this person may see. Sent as an ordinary question when picked.
 */
export function startersFor(page: ProtonPageContext | null, p: Permissions): string[] {
    const design = p.canSeeDomain("design");
    const hours = design && p.has(P.WORK_ENTRY_VIEW_ALL);
    const money = p.has(P.FINANCIAL_VIEW);
    const list: (string | false)[] = [];

    if (page?.entityType === "project") {
        list.push("How is this project doing?", p.has(P.REQUIREMENT_VIEW) && "What's still open on it?", hours && "Who has worked on it this month?");
    } else if (page?.entityType === "client") {
        list.push("What are this client's active projects?", money && "What does this client still owe?");
    } else if (page?.page === "financials") {
        list.push(money && "How does this month compare with last month?", money && "Which invoices are overdue?");
    } else if (page?.page === "people") {
        list.push(hours && "Who hasn't logged time this week?", hours && "Who logged the most hours last week?");
    } else if (page?.page === "projects") {
        list.push("Which projects are overdue?", "Which projects are on hold?");
    }

    list.push("What needs my attention?", "What changed this week?", hours && "How did hours compare with last week?");
    return [...new Set(list.filter((s): s is string => Boolean(s)))].slice(0, MAX);
}

/** Proton's hello, written here from the person's first name and the time of day: no model call. */
export function greetingFor(firstName: string | null | undefined, now: Date): string {
    const hour = now.getHours();
    const part = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
    const name = firstName?.trim();
    return name ? `${part}, ${name}.` : `${part}.`;
}
