import { useLocation } from "react-router";
import type { Domain } from "@/app/permissions/permissions";

export type ShellArea =
    | { kind: "domain"; domain: Domain; section: string | null }
    | { kind: "website"; section: string | null }
    | { kind: "company"; section: string | null };

/** Which area the page belongs to, and the nav section that should light up, from the URL. */
export function useArea(): ShellArea {
    const [first, second] = useLocation().pathname.split("/").filter(Boolean);
    if (first === "design" || first === "execution") return { kind: "domain", domain: first, section: second ?? null };
    if (first === "website") return { kind: "website", section: second ?? null };
    return { kind: "company", section: second ?? null };
}

/** The start of every path in an area: "/design", "/execution", "/website" or "/company". */
export function areaBase(area: ShellArea): string {
    return area.kind === "domain" ? `/${area.domain}` : `/${area.kind}`;
}
