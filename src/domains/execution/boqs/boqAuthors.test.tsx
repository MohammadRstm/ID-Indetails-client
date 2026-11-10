import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { boqs, summaryOf } from "@/test/fixtures/boqs";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

/*
 * BOQ authors in both businesses: a Design employee given boq:create keeps to Design, and reaches Execution's active
 * client sites only through the BOQs page, where a draft is private until it is submitted to the site.
 */

type Detail = Schemas["BoqDetailResponse"];

const designAuthor = withPermissions(personas.designEmployee, { grant: [P.BOQ_CREATE] });
const sarah = { id: designAuthor.id, name: "Sarah Test" };
const lobby = { id: 7, title: "Achrafieh Towers lobby", location: "Achrafieh, Beirut", status: "active" as const };
const lofts = { id: 8, title: "Mar Mikhael Lofts", location: null, status: "active" as const };
const SUBMITTED_AT = "2026-10-04T09:00:00Z";

/** Sarah's draft, private: only she sees it. */
const privateDraft: Detail = { ...boqs.draftMine, title: "Lobby quantities", author: sarah, submittedAt: null, changes: null };
const submittedDraft: Detail = { ...privateDraft, submittedAt: SUBMITTED_AT };

/** What others changed since she submitted it: a quantity and a unit cost, a line added and a line removed. */
const changedDraft: Detail = {
    ...submittedDraft,
    lines: submittedDraft.lines.map((l) => (l.id === 401 ? { ...l, quantity: 120, finalQuantity: 126, rate: 22.5, totalUsd: 2835 } : l)),
    changes: [
        { kind: "changed", lineId: 401, description: "Demolition", fields: [{ field: "quantity", before: "100", after: "120" }, { field: "rate", before: "20", after: "22.5" }] },
        { kind: "added", lineId: 403, description: "Electrical first fix", fields: [] },
        { kind: "removed", lineId: null, description: "Painting", fields: [] },
    ],
};

const authorSites = [
    http.get("/api/boq-sites", () => HttpResponse.json([lobby, lofts])),
    http.get("/api/boq-sites/:id", ({ params }) => HttpResponse.json(Number(params.id) === lobby.id ? lobby : lofts)),
];
/** The author's list on a site: only their own drafts, and no client BOQs, VOs or price. */
const ownList = (...drafts: Detail[]) =>
    http.get("/api/projects/:id/boqs", () => HttpResponse.json({ internal: drafts.map(summaryOf), client: [], vos: [], price: null }));
const refusal = (status: number, code: string) =>
    HttpResponse.json({ type: "business_rule", code, message: "The API's words.", errors: null, traceId: "t" }, { status });

/** What the API remembers of a draft: read again after a change, it answers with the changed one. */
function remembered(start: Detail) {
    let current = start;
    return {
        read: http.get(`/api/boqs/${start.id}`, () => HttpResponse.json(current)),
        becomes: (next: Detail) => { current = next; return HttpResponse.json(next); },
    };
}

/** Opens an author's draft through its link on the BOQs page, and waits for its editor. */
async function openDraft(start: Detail, ...handlers: RequestHandler[]) {
    renderApp(`/design/boq-sites/7?boq=${start.id}`, designAuthor, ...handlers, ...authorSites, ownList(start));
    const dialog = await screen.findByRole("dialog", { name: "Lobby quantities" });
    await within(dialog).findByLabelText("Title");
    return dialog;
}

describe("the BOQs page of an author", () => {
    it("lists the active client sites by name and location, in the author's own business", async () => {
        renderApp("/design/boq-sites", designAuthor, ...authorSites);
        const list = await screen.findByRole("list", { name: "Sites" });
        const cards = within(list).getAllByRole("listitem");
        expect(cards).toHaveLength(2);
        expect(cards[0]).toHaveTextContent("Achrafieh Towers lobby");
        expect(cards[0]).toHaveTextContent("Achrafieh, Beirut");
        expect(cards[1]).toHaveTextContent("Mar Mikhael Lofts");
        // boq:create didn't open Execution: the sidebar is Design's, with the BOQs page added
        expect((await screen.findAllByRole("button", { name: "BOQs" })).length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: "Daily logs" })).not.toBeInTheDocument();
    });

    it("says so when there is no site to write for", async () => {
        renderApp("/design/boq-sites", designAuthor, http.get("/api/boq-sites", () => HttpResponse.json([])));
        expect(await screen.findByText("No site to write BOQs for")).toBeInTheDocument();
    });

    it("opens a site to its name, its location and the author's own BOQs, with none of its other tabs", async () => {
        renderApp("/design/boq-sites", designAuthor, ...authorSites, ownList(privateDraft, { ...submittedDraft, id: 52, title: "Submitted quantities" }));
        await userEvent.click(await screen.findByRole("link", { name: "Open Achrafieh Towers lobby" }));
        expect(await screen.findByRole("heading", { name: "Achrafieh Towers lobby" })).toBeInTheDocument();
        expect(screen.getByText("Achrafieh, Beirut")).toBeInTheDocument();
        const panel = await screen.findByRole("region", { name: "Bills of quantities" });
        expect(within(panel).getByText("My drafts")).toBeInTheDocument();
        // a private draft says so, and a submitted one
        expect(await within(panel).findByRole("button", { name: "Open Lobby quantities" })).toHaveTextContent("Private");
        expect(within(panel).getByRole("button", { name: "Open Submitted quantities" })).toHaveTextContent("Submitted");
        expect(within(panel).getByRole("button", { name: "New draft" })).toBeEnabled();
        // nothing else of the site: no tabs, no client BOQs, VOs or price
        expect(screen.queryByRole("tab")).not.toBeInTheDocument();
        for (const text of ["Client BOQs", "VOs"]) expect(within(panel).queryByText(text)).not.toBeInTheDocument();
        expect(within(panel).queryByRole("group", { name: "Price" })).not.toBeInTheDocument();
        for (const name of ["New client BOQ", "New VO"]) expect(within(panel).queryByRole("button", { name })).not.toBeInTheDocument();
    });

    it("starts a draft on the site and opens it", async () => {
        const created: unknown[] = [];
        renderApp("/design/boq-sites/7", designAuthor, ...authorSites, ownList(),
            http.post("/api/projects/:id/boqs", async ({ request }) => { created.push(await request.json()); return HttpResponse.json(privateDraft); }),
            http.get("/api/boqs/51", () => HttpResponse.json(privateDraft)));
        await userEvent.click(await screen.findByRole("button", { name: "New draft" }));
        const dialog = await screen.findByRole("dialog", { name: "New draft" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        await waitFor(() => expect(created).toEqual([{ kind: "internal" }]));
        expect(await screen.findByRole("dialog", { name: "Lobby quantities" })).toBeInTheDocument();
    });

    it("is not offered to someone without boq:create", async () => {
        renderApp("/design/boq-sites", personas.designEmployee, ...authorSites);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Sites" })).not.toBeInTheDocument();
    });

    it("says when the site is not one they write for", async () => {
        renderApp("/design/boq-sites/99", designAuthor, http.get("/api/boq-sites/:id", () => refusal(404, "not_found")));
        expect(await screen.findByText("Site not found")).toBeInTheDocument();
    });
});

describe("submitting a draft", () => {
    it("asks first who will see it, then hands it to the site and makes it read-only", async () => {
        const memory = remembered(privateDraft);
        let submitted = 0;
        const dialog = await openDraft(privateDraft, memory.read,
            http.post("/api/boqs/51/submit", () => { submitted += 1; return memory.becomes(submittedDraft); }));
        expect(within(dialog).getByText("Private", { selector: ".badge" })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Title")).toBeEnabled();
        expect(within(dialog).queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "Submit" }));
        const confirm = await screen.findByRole("dialog", { name: "Submit Lobby quantities?" });
        expect(confirm).toHaveTextContent("pricing managers");
        expect(confirm).toHaveTextContent("withdraw it at any time");
        expect(submitted).toBe(0);
        await userEvent.click(within(confirm).getByRole("button", { name: "Submit" }));

        await waitFor(() => expect(submitted).toBe(1));
        expect(await within(dialog).findByText(/Submitted on Oct 4, 2026/)).toBeInTheDocument();
        expect(within(dialog).getByText(/pricing managers and owner see it and may change it/)).toBeInTheDocument();
        expect(within(dialog).getByText("Submitted", { selector: ".badge" })).toBeInTheDocument();
        // read-only for its author now, who can take it back
        expect(within(dialog).getByLabelText("Title")).toBeDisabled();
        expect(within(dialog).getByLabelText("Description 1")).toBeDisabled();
        expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeEnabled();
        for (const name of ["Save", "Submit"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Submit Lobby quantities?" })).not.toBeInTheDocument();
        // and can't delete it
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        expect(await screen.findByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    });

    it("waits for unsaved changes to be saved, and for a draft to have lines", async () => {
        const dialog = await openDraft(privateDraft, http.get("/api/boqs/51", () => HttpResponse.json(privateDraft)));
        const submit = within(dialog).getByRole("button", { name: "Submit" });
        expect(submit).toBeEnabled();
        await userEvent.type(within(dialog).getByLabelText("Title"), "!");
        expect(submit).toBeDisabled();
        expect(submit).toHaveAttribute("title", "Save your changes first.");
    });

    it("can't submit a draft with no lines", async () => {
        const empty = { ...privateDraft, lines: [], lineCount: 0 };
        const dialog = await openDraft(empty, http.get("/api/boqs/51", () => HttpResponse.json(empty)));
        const submit = within(dialog).getByRole("button", { name: "Submit" });
        expect(submit).toBeDisabled();
        expect(submit).toHaveAttribute("title", "Add lines and save first.");
    });

    it("says in words when the API refuses, and keeps the question open", async () => {
        const dialog = await openDraft(privateDraft, http.get("/api/boqs/51", () => HttpResponse.json(privateDraft)),
            http.post("/api/boqs/51/submit", () => refusal(422, "boq_already_submitted")));
        await userEvent.click(within(dialog).getByRole("button", { name: "Submit" }));
        const confirm = await screen.findByRole("dialog", { name: "Submit Lobby quantities?" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Submit" }));
        expect(await within(confirm).findByText("This draft is already submitted. Reload it to see where it stands.")).toBeInTheDocument();
    });

    it("can be deleted by its author while it is private", async () => {
        const dialog = await openDraft(privateDraft, http.get("/api/boqs/51", () => HttpResponse.json(privateDraft)));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        expect(await screen.findByRole("button", { name: "Delete draft" })).toBeInTheDocument();
    });
});

describe("withdrawing a submitted draft", () => {
    it("takes it back: private again, to change and submit again", async () => {
        const memory = remembered(submittedDraft);
        let withdrawn = 0;
        const dialog = await openDraft(submittedDraft, memory.read,
            http.post("/api/boqs/51/withdraw-submission", () => { withdrawn += 1; return memory.becomes(privateDraft); }));
        expect(within(dialog).getByLabelText("Title")).toBeDisabled();
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

        await waitFor(() => expect(withdrawn).toBe(1));
        await waitFor(() => expect(within(dialog).getByLabelText("Title")).toBeEnabled());
        expect(within(dialog).getByText("Private", { selector: ".badge" })).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Submit" })).toBeEnabled();
        expect(within(dialog).queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
        expect(within(dialog).queryByText(/Submitted on/)).not.toBeInTheDocument();
    });

    it("says in words when the API refuses", async () => {
        const dialog = await openDraft(submittedDraft, http.get("/api/boqs/51", () => HttpResponse.json(submittedDraft)),
            http.post("/api/boqs/51/withdraw-submission", () => refusal(422, "boq_not_submitted")));
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
        expect(await screen.findByText("This draft isn't submitted, so there is nothing to withdraw or keep.")).toBeInTheDocument();
    });
});

describe("a submitted draft others changed", () => {
    it("shows what changed since it was submitted: old values struck through, added lines, removed lines", async () => {
        const dialog = await openDraft(changedDraft, http.get("/api/boqs/51", () => HttpResponse.json(changedDraft)));
        expect(within(dialog).getByText(/Changed since you submitted it/)).toBeInTheDocument();
        expect(within(dialog).getByText("Changed", { selector: ".badge" })).toBeInTheDocument();
        expect(within(dialog).queryByText(/Submitted on/)).not.toBeInTheDocument();

        // the changed cells show the old value, then the new one
        const row = within(dialog).getByLabelText("Quantity 1").closest("tr") as HTMLElement;
        expect([...row.querySelectorAll("del")].map((d) => d.textContent)).toEqual(["100", "20"]);
        expect(within(dialog).getByLabelText("Quantity 1")).toHaveValue("120");
        expect(within(dialog).getByLabelText("Unit cost 1")).toHaveValue("22.5");
        // a line nothing happened to shows nothing struck
        const untouched = within(dialog).getByLabelText("Quantity 2").closest("tr") as HTMLElement;
        expect(untouched.querySelectorAll("del")).toHaveLength(0);
        // an added line is marked
        expect(within(dialog).getByText("Added")).toBeInTheDocument();
        // a removed one is listed under the table
        expect(within(dialog).getByText(/Removed since you submitted it:/).closest("div")).toHaveTextContent("Painting");
        for (const name of ["Keep the changes", "Withdraw"]) expect(within(dialog).getByRole("button", { name })).toBeEnabled();
    });

    it("keeps the changes: the highlights clear and the draft stays submitted", async () => {
        const memory = remembered(changedDraft);
        let kept = 0;
        const dialog = await openDraft(changedDraft, memory.read,
            http.post("/api/boqs/51/keep", () => { kept += 1; return memory.becomes({ ...changedDraft, changes: [] }); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Keep the changes" }));

        await waitFor(() => expect(kept).toBe(1));
        expect(await within(dialog).findByText(/Submitted on Oct 4, 2026/)).toBeInTheDocument();
        expect(within(dialog).queryByText(/Changed since you submitted it/)).not.toBeInTheDocument();
        expect(dialog.querySelector("del")).toBeNull();
        expect(within(dialog).queryByText(/Removed since you submitted it:/)).not.toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Keep the changes" })).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeEnabled();
    });

    it("can be withdrawn instead, with the changes in it", async () => {
        const memory = remembered(changedDraft);
        const dialog = await openDraft(changedDraft, memory.read,
            http.post("/api/boqs/51/withdraw-submission", () => memory.becomes({ ...changedDraft, submittedAt: null, changes: null })));
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
        await waitFor(() => expect(within(dialog).getByLabelText("Title")).toBeEnabled());
        expect(dialog.querySelector("del")).toBeNull();
        expect(within(dialog).getByLabelText("Quantity 1")).toHaveValue("120");
    });
});

describe("the drafts engineers submit, on the site", () => {
    // karim: an Execution admin the money was handed to, who manages the pricing
    const manager = withPermissions(personas.executionAdmin, { grant: [P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE, P.BOQ_CREATE] });

    it("show a pricing manager the submitted ones with their author and state, never the private ones", async () => {
        // the API sends the manager only the submitted drafts
        const list = { ...boqs.list, internal: [summaryOf(submittedDraft), summaryOf({ ...changedDraft, id: 52, title: "Second quantities" })] };
        renderApp(`/execution/projects/${site.project.id}?part=boqs`, manager,
            http.get("/api/projects/:id/boqs", () => HttpResponse.json(list)), ...siteHandlers);
        const panel = await screen.findByRole("region", { name: "Bills of quantities" });
        const first = await within(panel).findByRole("button", { name: "Open Lobby quantities" });
        expect(first).toHaveTextContent("by Sarah Test");
        expect(first).toHaveTextContent("Submitted");
        expect(within(panel).getByRole("button", { name: "Open Second quantities" })).toHaveTextContent("Changed");
        expect(within(panel).getByText("Internal drafts")).toBeInTheDocument();
        expect(within(panel).queryByText("Private")).not.toBeInTheDocument();
    });

    it("open to a pricing manager as the author's submission, to read and to change", async () => {
        renderApp(`/execution/projects/${site.project.id}?boq=51`, manager,
            http.get("/api/boqs/51", () => HttpResponse.json(submittedDraft)), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Lobby quantities" });
        expect(await within(dialog).findByText(/Submitted by Sarah Test/)).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Title")).toBeEnabled();
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
        // handing it over and taking it back are its author's
        for (const name of ["Submit", "Withdraw", "Keep the changes"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        expect(await screen.findByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        // nobody deletes a submitted draft
        expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    });

    it("show the site's owner the BOQs part and the drafts, without any BOQ permission", async () => {
        // the lobby's owner is person 10
        const owner = { ...personas.executionAdmin, id: 10 };
        const list = { internal: [summaryOf(submittedDraft)], client: [], vos: [], price: null };
        renderApp(`/execution/projects/${site.project.id}?part=boqs`, owner,
            http.get("/api/projects/:id/boqs", () => HttpResponse.json(list)), ...siteHandlers);
        const panel = await screen.findByRole("region", { name: "Bills of quantities" });
        expect(screen.getByRole("tab", { name: "BOQs", selected: true })).toBeInTheDocument();
        expect(await within(panel).findByRole("button", { name: "Open Lobby quantities" })).toHaveTextContent("by Sarah Test");
        expect(within(panel).getByText("Internal drafts")).toBeInTheDocument();
        for (const name of ["New draft", "New client BOQ", "New VO"]) expect(within(panel).queryByRole("button", { name })).not.toBeInTheDocument();
    });
});
