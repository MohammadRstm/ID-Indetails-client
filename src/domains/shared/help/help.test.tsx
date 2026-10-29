import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { companyRoutes, domainRoutes, websiteRoutes } from "@/app/routing/routeTable";
import type { ShellArea } from "@/app/shell/useArea";
import { settings } from "@/test/fixtures/settings";
import { MONEY_AND_HIRING, personas, withPermissions, type PersonaName } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { ARTICLES, ARTICLE_BY_ID } from "./content";
import { NO_FACTS } from "./helpFacts";
import { resolveLink } from "./helpLinks";
import { CATEGORIES, visibleBlocks, type HelpContext, type HelpLink } from "./helpModel";
import { searchHelp } from "./helpSearch";

/** Where each persona reads Help from: their own business, or the company area for the super admin. */
const HOME: Record<PersonaName, ShellArea> = {
    superAdmin: { kind: "company", section: "help" },
    designAdmin: { kind: "domain", domain: "design", section: "help" },
    executionAdmin: { kind: "domain", domain: "execution", section: "help" },
    designEmployee: { kind: "domain", domain: "design", section: "help" },
    executionEmployee: { kind: "domain", domain: "execution", section: "help" },
    websiteAdmin: { kind: "website", section: "help" },
};
const NAMES = Object.keys(HOME) as PersonaName[];

const ctxOf = (name: PersonaName, user = personas[name]): HelpContext => ({ p: permissionsOf(user), area: HOME[name] });
const readable = (ctx: HelpContext) => ARTICLES.filter((a) => a.who(ctx)).map((a) => a.id);
const top = (ctx: HelpContext, query: string) => searchHelp(ARTICLES.filter((a) => a.who(ctx)), query, ctx, NO_FACTS).map((h) => h.article.id);

function linksOf(blocks: Parameters<typeof visibleBlocks>[0], ctx: HelpContext): HelpLink[] {
    return visibleBlocks(blocks, ctx).flatMap((b) => (b.kind === "links" ? b.links : []));
}

describe("Help's content", () => {
    it("has one article per id, in a known topic, and only links to articles that exist", () => {
        expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
        for (const a of ARTICLES) {
            expect(Object.keys(CATEGORIES), a.id).toContain(a.category);
            for (const r of a.related ?? []) expect(ARTICLE_BY_ID.has(r), `${a.id} → ${r}`).toBe(true);
        }
    });

    it("never offers a link nobody who reads the article can follow (so no link points at a page that doesn't exist)", () => {
        const routes = new Set([...domainRoutes.map((r) => r.path), ...companyRoutes.map((r) => r.path), ...websiteRoutes.map((r) => r.path)]);
        for (const a of ARTICLES) {
            const readers = NAMES.filter((n) => a.who(ctxOf(n)));
            for (const l of a.blocks.flatMap(function all(b): HelpLink[] { return b.kind === "links" ? b.links : b.kind === "only" ? b.blocks.flatMap(all) : []; })) {
                const followed = readers.some((n) => resolveLink(l, ctxOf(n), personas[n].id).length > 0);
                expect(followed, `${a.id}: ${l.label}`).toBe(true);
                const path = "business" in l.to ? l.to.business : "company" in l.to ? l.to.company : "website" in l.to ? l.to.website : "here" in l.to ? l.to.here : null;
                if (path) expect([...routes].some((r) => r.split("/")[0] === path.split(/[?/]/)[0]), `${a.id}: ${path}`).toBe(true);
            }
        }
    });

    it("gives each role its own guides", () => {
        const sa = readable(ctxOf("superAdmin")), da = readable(ctxOf("designAdmin")), xa = readable(ctxOf("executionAdmin"));
        const de = readable(ctxOf("designEmployee")), xe = readable(ctxOf("executionEmployee"));

        // the company's pages are the super admin's alone
        for (const id of ["company-details", "salaries", "excuse-hours", "schedules", "manage-permissions", "company-figures", "exchange-rate"]) {
            expect(sa, id).toContain(id);
            for (const other of [da, xa, de, xe]) expect(other, id).not.toContain(id);
        }
        // money is for super admins, and for an admin one of them hands it to; never for employees
        const dm = readable(ctxOf("designAdmin", withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING })));
        const xm = readable(ctxOf("executionAdmin", withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING })));
        for (const id of ["revenue", "expected-revenue", "billing-terms", "project-cost", "profit-margin", "create-invoice", "record-payment"]) {
            for (const reader of [sa, dm, xm]) expect(reader, id).toContain(id);
            for (const other of [da, xa, de, xe]) expect(other, id).not.toContain(id);
        }
        // each business's own work
        expect(de).toEqual(expect.arrayContaining(["log-work", "timer", "my-pay", "hours-balance", "pay", "deductions", "behind"]));
        // site staff report labour and write daily logs; materials are recorded by whoever is given them
        expect(xe).toEqual(expect.arrayContaining(["labour-week", "daily-log"]));
        expect(xe).not.toContain("record-materials");
        expect(xe).not.toContain("log-work");
        expect(de).not.toContain("record-materials");
        expect(xm).toEqual(expect.arrayContaining(["set-pricing", "boqs", "write-boq", "agree-boq", "execution-pricing", "site-money"]));
        for (const id of ["set-pricing", "boqs", "write-boq", "agree-boq", "execution-pricing", "site-money"]) expect(xa, id).not.toContain(id);
        expect(da).not.toContain("site-money");
        // the hours balance is Design's employees', and only employees log hours: admins are paid a fixed salary
        expect(da).not.toContain("hours-balance");
        for (const admin of [sa, da, xa]) for (const id of ["log-work", "timer", "my-pay"]) expect(admin, id).not.toContain(id);
        // everyone reads the basics
        for (const list of [sa, da, xa, de, xe]) expect(list).toEqual(expect.arrayContaining(["sign-in", "change-password", "privacy", "roles", "report-bug"]));
    });

    it("gives the website's staff the website's guides and none of the businesses'", () => {
        const wa = readable(ctxOf("websiteAdmin"));
        expect(wa).toContain("company-website");
        expect(wa).not.toContain("website-staff");
        for (const id of ["log-work", "company-details", "create-invoice", "revenue", "record-materials"]) expect(wa, id).not.toContain(id);
        expect(readable(ctxOf("superAdmin"))).toEqual(expect.arrayContaining(["company-website", "website-staff"]));
        expect(readable(ctxOf("designAdmin"))).not.toContain("company-website");
        expect(readable(ctxOf("designAdmin", withPermissions(personas.designAdmin, { grant: [P.WEBSITE_MANAGE] })))).toContain("company-website");
        // its link opens the Website area
        const link = resolveLink({ label: "x", to: { website: "projects" } }, ctxOf("websiteAdmin"), personas.websiteAdmin.id);
        expect(link.map((l) => l.path)).toEqual(["/website/projects"]);
    });

    it("follows a person's own permissions, not only their role", () => {
        const money = withPermissions(personas.designAdmin, { grant: [P.FINANCIAL_VIEW] });
        expect(readable(ctxOf("designAdmin", money))).toContain("billing-terms");
        const paysPeople = withPermissions(personas.designEmployee, { grant: [P.SALARY_VIEW] });
        expect(readable(ctxOf("designEmployee", paysPeople))).toContain("project-pay-vs-salaries");
    });

    it("finds the answer in the asker's own words", () => {
        expect(top(ctxOf("superAdmin"), "how can I change the address of the company")[0]).toBe("company-details");
        expect(top(ctxOf("superAdmin"), "company adress")[0]).toBe("company-details");
        expect(top(ctxOf("designAdmin"), "company address")).not.toContain("company-details");
        const money = ctxOf("designAdmin", withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING }));
        expect(top(money, "what is outstanding")[0]).toBe("billing-terms");
        expect(top(money, "revenue vs expected revenue")[0]).toBe("expected-revenue");
        expect(top(ctxOf("designAdmin"), "outstanding")).not.toContain("billing-terms");
        expect(top(ctxOf("designEmployee"), "outstanding")).not.toContain("billing-terms");
        expect(top(ctxOf("designEmployee"), "how is my salary calculated")).toContain("pay");
        // an Execution site's price comes from its BOQs
        const pricing = ctxOf("executionAdmin", withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING }));
        expect(top(pricing, "agree boq")).toContain("agree-boq");
        expect(top(pricing, "variation order")).toContain("boqs");
        expect(top(ctxOf("executionAdmin"), "agree boq")).not.toContain("agree-boq");
    });

    it("resolves links for the reader: a super admin's business links name the business", () => {
        const sa = ctxOf("superAdmin");
        expect(resolveLink({ label: "x", to: { settings: "general" } }, sa, 1)).toEqual([{ label: "x", path: "/company/settings?section=general", sub: undefined }]);
        expect(resolveLink({ label: "x", to: { business: "clients?new=1" } }, sa, 1).map((l) => [l.path, l.sub]))
            .toEqual([["/design/clients?new=1", "Design"], ["/execution/clients?new=1", "Execution"]]);
        // a Design admin's link stays in Design, and a page they can't open isn't offered
        const da = ctxOf("designAdmin");
        expect(resolveLink({ label: "x", to: { business: "clients?new=1" } }, da, 2).map((l) => l.path)).toEqual(["/design/clients?new=1"]);
        expect(resolveLink({ label: "x", to: { company: "salaries" } }, da, 2)).toEqual([]);
    });

    it("says which links a reader gets: an employee's company-settings link never appears", () => {
        const de = ctxOf("designEmployee");
        const all = ARTICLES.filter((a) => a.who(de)).flatMap((a) => linksOf(a.blocks, de)).flatMap((l) => resolveLink(l, de, 4));
        expect(all.every((l) => !l.path.startsWith("/company/") || l.path === "/company")).toBe(true);
    });
});

describe("the Help page", () => {
    const facts = [
        http.get("/api/company/working-time", () => HttpResponse.json(settings.workingTime)),
        http.get("/api/domain-settings/:domain", () => HttpResponse.json(settings.domainRules)),
    ];

    it("answers a super admin's question and links straight to the page", async () => {
        renderApp("/company/help", personas.superAdmin, ...facts);
        const search = await screen.findByRole("textbox", { name: "Search Help" });
        await userEvent.type(search, "change the company address");
        const answers = await screen.findByRole("listbox", { name: "Answers" });
        await userEvent.click(within(answers).getAllByRole("option")[0]);
        const article = await screen.findByRole("article", { name: "Changing the company's name, address, website or logo" });
        expect(within(article).getByRole("link", { name: /Open company settings/ })).toHaveAttribute("href", "/company/settings?section=general");
    });

    it("quotes the company's own working day", async () => {
        renderApp("/design/help?article=working-day", personas.designEmployee, ...facts);
        const article = await screen.findByRole("article", { name: "The working day, required hours and the paid break" });
        expect(await within(article).findByText(/9:00 AM to 5:00 PM is 8h; minus the 1h break, 7h of work is required/)).toBeInTheDocument();
    });

    it("lists only the topics a person has something in", async () => {
        renderApp("/execution/help", personas.executionEmployee, ...facts);
        const topics = await screen.findByRole("navigation", { name: "Help topics" });
        expect(within(topics).getByRole("button", { name: /Your work/ })).toBeInTheDocument();
        expect(within(topics).queryByRole("button", { name: /Invoices and payments/ })).toBeNull();
        expect(within(topics).queryByRole("button", { name: /The company/ })).toBeNull();
        // the one money article they get is how the costs they record add up
        await userEvent.click(within(topics).getByRole("button", { name: /Money, explained/ }));
        expect(screen.getAllByRole("button", { name: /Material and ground labour costs/ })).toHaveLength(1);
        expect(screen.queryByRole("button", { name: /Revenue/ })).toBeNull();
    });

    it("doesn't open an article the reader may not read", async () => {
        renderApp("/design/help?article=salaries", personas.designEmployee, ...facts);
        expect(await screen.findByRole("navigation", { name: "Help topics" })).toBeInTheDocument();
        expect(screen.queryByRole("article")).toBeNull();
    });

    it("is reached from the top bar, back at its start", async () => {
        renderApp("/design/help?article=sign-in", personas.designEmployee, ...facts);
        expect(await screen.findByRole("article", { name: "Signing in, and a forgotten password" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Help" }));
        expect(screen.queryByRole("article")).toBeNull();
        expect(screen.getByRole("button", { name: "Start here" })).toHaveClass("on");
    });
});
