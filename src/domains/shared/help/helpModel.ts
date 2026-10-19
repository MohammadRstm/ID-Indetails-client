import { P, type PermissionCode } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { hasSeveralAreas } from "@/app/routing/areas";
import type { ShellArea } from "@/app/shell/useArea";
import type { HelpFacts } from "./helpFacts";

/*
 * Help is plain data: articles made of a few kinds of blocks, rendered by HelpArticle. Each article, and any part
 * of one, says who it is for, from the reader's role and permissions, so a super admin, a Design admin and an
 * Execution employee each read their own Help, and someone whose permissions were changed reads what fits them.
 * Help never tells anyone what their permissions keep from them on screen.
 */

export type HelpContext = { p: Permissions; area: ShellArea };
export type Rule = (ctx: HelpContext) => boolean;

/** Text, or text built from the company's own settings (working hours, break, overtime rate…). */
export type Text = string | ((facts: HelpFacts) => string);

/** Where a link goes; resolved for the reader by helpLinks.ts, and left out when they can't open it. */
export type LinkTo =
    /** A page of a business ("projects?new=1"): the one being looked at, or only this one. */
    | { business: string; only?: Domain }
    /** The same page in whichever area is being looked at ("notifications"). */
    | { here: string }
    /** A page of the company area ("salaries"). */
    | { company: string }
    /** A page of the Website area ("services"). */
    | { website: string }
    /** A Settings section, in the company area for those who reach it. */
    | { settings: string }
    /** A fixed path ("/change-password"). */
    | { path: string }
    /** The reader's own profile. */
    | { profile: true };

export type HelpLink = { label: string; to: LinkTo };

/** One step, with where it happens ("Settings", "Company"). */
export type Step = { text: Text; where?: string[] };

export type Block =
    | { kind: "p"; text: Text }
    | { kind: "steps"; steps: Step[] }
    | { kind: "list"; items: Text[] }
    | { kind: "formula"; text: Text; example?: Text }
    | { kind: "note"; text: Text }
    | { kind: "links"; links: HelpLink[] }
    /** Blocks only some readers get. */
    | { kind: "only"; when: Rule; blocks: Block[] };

export const CATEGORIES = {
    start: "Getting started",
    work: "Your work",
    projects: "Projects",
    clients: "Clients",
    billing: "Invoices and payments",
    people: "People and access",
    company: "The company",
    website: "The website",
    settings: "Settings",
    pay: "Hours and pay, explained",
    money: "Money, explained",
} as const;

export type Category = keyof typeof CATEGORIES;

export type Article = {
    id: string;
    title: string;
    category: Category;
    who: Rule;
    summary: Text;
    /** The ways people ask for it, for search. */
    ask: string[];
    blocks: Block[];
    related?: string[];
};

export const textOf = (text: Text, facts: HelpFacts) => (typeof text === "function" ? text(facts) : text);

// ---- rules ----

export const everyone: Rule = () => true;
export const has = (...codes: PermissionCode[]): Rule => ({ p }) => p.hasAll(...codes);
export const hasAny = (...codes: PermissionCode[]): Rule => ({ p }) => p.hasAny(...codes);
export const and = (...rules: Rule[]): Rule => (ctx) => rules.every((r) => r(ctx));
export const or = (...rules: Rule[]): Rule => (ctx) => rules.some((r) => r(ctx));
export const not = (rule: Rule): Rule => (ctx) => !rule(ctx);
/** They may enter this business. */
export const sees = (domain: Domain): Rule => ({ p }) => p.canSeeDomain(domain);
export const isEmployee: Rule = ({ p }) => !p.isAdmin;
export const isSuperAdmin: Rule = ({ p }) => p.isSuperAdmin;
export const severalAreas: Rule = ({ p }) => hasSeveralAreas(p);
/** The hours ledger (expected hours, short, behind) covers Design's employees only. */
export const tracksOwnHours: Rule = ({ p }) => p.role === "employee" && p.homeDomain === "design" && p.has(P.WORK_ENTRY_VIEW_OWN);

// ---- blocks, written short ----

export const para = (text: Text): Block => ({ kind: "p", text });
export const step = (text: Text, ...where: string[]): Step => ({ text, where: where.length ? where : undefined });
export const steps = (...list: Step[]): Block => ({ kind: "steps", steps: list });
export const list = (...items: Text[]): Block => ({ kind: "list", items });
export const formula = (text: Text, example?: Text): Block => ({ kind: "formula", text, example });
export const note = (text: Text): Block => ({ kind: "note", text });
export const links = (...list: HelpLink[]): Block => ({ kind: "links", links: list });
export const only = (when: Rule, ...blocks: Block[]): Block => ({ kind: "only", when, blocks });
export const link = (label: string, to: LinkTo): HelpLink => ({ label, to });

/** The blocks this reader gets, with "only" blocks opened up or left out. */
export function visibleBlocks(blocks: Block[], ctx: HelpContext): Exclude<Block, { kind: "only" }>[] {
    return blocks.flatMap((b) => (b.kind === "only" ? (b.when(ctx) ? visibleBlocks(b.blocks, ctx) : []) : [b]));
}

/** All the words of an article this reader can see, for search. */
export function plainText(article: Article, ctx: HelpContext, facts: HelpFacts): string {
    const parts: string[] = [textOf(article.summary, facts)];
    for (const b of visibleBlocks(article.blocks, ctx)) {
        if (b.kind === "p" || b.kind === "note") parts.push(textOf(b.text, facts));
        if (b.kind === "formula") parts.push(textOf(b.text, facts), b.example ? textOf(b.example, facts) : "");
        if (b.kind === "list") parts.push(...b.items.map((t) => textOf(t, facts)));
        if (b.kind === "steps") parts.push(...b.steps.map((s) => `${textOf(s.text, facts)} ${(s.where ?? []).join(" ")}`));
        if (b.kind === "links") parts.push(...b.links.map((l) => l.label));
    }
    return parts.join(" ");
}
