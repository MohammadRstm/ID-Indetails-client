import { useLocation } from "react-router";
import type { Domain } from "@/app/permissions/permissions";

export type ShellArea =
    | { kind: "domain"; domain: Domain; section: string | null }
    | { kind: "company"; section: string | null };

/** Which area the page belongs to, and the nav section that should light up, from the URL. */
export function useArea(): ShellArea {
    const [first, second] = useLocation().pathname.split("/").filter(Boolean);
    if (first === "design" || first === "execution") return { kind: "domain", domain: first, section: second ?? null };
    return { kind: "company", section: second ?? null };
}
