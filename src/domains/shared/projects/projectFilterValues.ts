import type { ProjectStatus } from "./projectsApi";

/** What the projects list is narrowed to. "all" (and no quarter) means not narrowed on that. */
export type ProjectFilterValues = {
    status: ProjectStatus | "all";
    quarter: number | null;
    /** Only matters with a quarter. */
    year: number;
    type: "all" | "client" | "internal";
    /** A client's id, "internal" for projects with no client, or "all". */
    client: string;
    /** A person's id, or "all". */
    owner: string;
};

export const STATUS_LABEL: Record<ProjectStatus | "all", string> = {
    all: "All", active: "Active", hold: "On hold", completed: "Completed", archived: "Archived",
};

export const TYPE_LABEL: Record<ProjectFilterValues["type"], string> = { all: "All work", client: "Client work", internal: "Internal" };

/** A filter that is on, as the chip under the filter bar names it, and what turns it off. */
export type ActiveFilter = { key: string; label: string; clear: Partial<ProjectFilterValues> };

/** The filters that are on, in the order the drawer lists them. `name` finds a client's or a person's name from their id. */
export function activeFilters(v: ProjectFilterValues, name: { client: (id: string) => string; owner: (id: string) => string }): ActiveFilter[] {
    const on: ActiveFilter[] = [];
    if (v.status !== "all") on.push({ key: "status", label: STATUS_LABEL[v.status], clear: { status: "all" } });
    if (v.quarter) on.push({ key: "quarter", label: `Q${v.quarter} ${v.year}`, clear: { quarter: null } });
    if (v.type !== "all") on.push({ key: "type", label: TYPE_LABEL[v.type], clear: { type: "all" } });
    if (v.client !== "all") on.push({ key: "client", label: v.client === "internal" ? "Internal (no client)" : name.client(v.client), clear: { client: "all" } });
    if (v.owner !== "all") on.push({ key: "owner", label: `Owner: ${name.owner(v.owner)}`, clear: { owner: "all" } });
    return on;
}
