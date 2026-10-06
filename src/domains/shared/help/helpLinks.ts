import { DOMAINS, type Domain } from "@/app/permissions/permissions";
import { canOpen } from "@/app/routing/routeTable";
import { myProfilePath } from "@/app/shell/profilePath";
import { company, settings } from "@/app/shell/searchPlaces";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import type { HelpContext, HelpLink } from "./helpModel";

export type ResolvedLink = { label: string; path: string; sub?: string };

/**
 * Where a Help link goes for this reader, from the same rules the search uses: nothing when they can't open the
 * page, so Help never offers a door that won't open. A business page goes to the business being looked at, or
 * from the company area to each one they may open it in (named when there are several).
 */
export function resolveLink(link: HelpLink, ctx: HelpContext, userId: number): ResolvedLink[] {
    const { to } = link;
    const targets: { path: string; sub?: string }[] =
        "business" in to ? businessPages(ctx, to.business, to.only)
        : "here" in to ? (ctx.area.kind === "domain" ? businessPages(ctx, to.here) : company(ctx, to.here).flatMap((t) => ("path" in t ? [t] : [])))
        : "company" in to ? company(ctx, to.company).flatMap((t) => ("path" in t ? [t] : []))
        : "settings" in to ? settings(ctx, to.settings).flatMap((t) => ("path" in t ? [t] : []))
        : "path" in to ? [{ path: to.path }]
        : profile(ctx, userId);
    return targets.map((t) => ({ label: link.label, path: t.path, sub: t.sub }));
}

function businessPages(ctx: HelpContext, path: string, only?: Domain) {
    const { p, area } = ctx;
    // a page of one business opens there even from the other one, for someone who sees both
    const domains = (only ? [only] : area.kind === "domain" ? [area.domain] : DOMAINS).filter((d) => canOpen(p, d, path));
    return domains.map((d) => ({ path: `/${d}/${path}`, sub: domains.length > 1 || (only && area.kind === "domain" && area.domain !== only) ? DOMAIN_LABEL[d] : undefined }));
}

function profile(ctx: HelpContext, userId: number) {
    const path = myProfilePath(ctx.p, ctx.area, userId);
    return path ? [{ path }] : [];
}

/** The Help page of the area being looked at, at an article. */
export function helpPath(ctx: Pick<HelpContext, "area">, article?: string): string {
    const base = ctx.area.kind === "domain" ? `/${ctx.area.domain}/help` : "/company/help";
    return article ? `${base}?article=${encodeURIComponent(article)}` : base;
}
