import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { commentOf, messageOf, mockDiscussion, peopleFor, STAFF_BASE, summaryOf, threadOf, threadSummaryOf } from "@/portal/discussion/discussionTestKit";
import { resetLinks } from "@/portal/presentation/presentationLinks";
import type { PortalPresentation } from "@/portal/presentation/presentationTypes";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { work, workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { server } from "@/test/server";
import PresentationPreview from "./PresentationPreview";
import { contentOf, fileOf, itemOf, part, served } from "./portalTestKit";

/*
 * The staff's side of a project's discussion: the Discussion part of the Client portal tab (the chat beside the comments
 * on files), who gets that tab, and the comment counts on the content cards. Anyone who takes part in the discussion
 * sees it, whatever their permissions; the API answers 404 to everyone else.
 */

const nadia = personas.designAdmin;
const sarah = personas.designEmployee;
const page = `/design/projects/${projectWork.project.id}`;
const discussion = part("discussion");
const apiBase = `/api/projects/${projectWork.project.id}/portal/discussion`;

/** The discussion as `viewer` (a person's key: u2 is Nadia, u4 Sarah) sees it: the client's contact (c7) and Nadia wrote in the chat and on a file. */
function discussionOf(viewer: string) {
    const who = (key: string) => peopleFor(viewer).find((p) => p.key === key)!;
    return mockDiscussion(STAFF_BASE, {
        viewer,
        summary: summaryOf(viewer, { threads: [threadSummaryOf(5, "Living room v3", { count: 2, unread: 1 })] }),
        messages: [messageOf(1, who("c7"), "Hello from the client"), messageOf(2, who("u2"), "Welcome aboard")],
        threads: {
            5: threadOf(5, "Living room v3", [
                commentOf(1, 5, who("c7"), "Is this the final sofa?"),
                commentOf(2, 5, who("u2"), "Yes, it is the final one"),
            ]),
        },
    });
}

/** What the API answers to someone who does not take part. */
const notAParticipant = () => HttpResponse.json({ type: "not_found", code: "not_found", message: "Not found." }, { status: 404 });

beforeEach(resetLinks);

describe("the Discussion part of the Client portal tab", () => {
    it("shows the project chat and the files that have comments, beside the other parts", async () => {
        const { box, handlers } = discussionOf("u2");
        renderApp(discussion, nadia, ...projectWorkHandlers, ...handlers);

        const parts = await screen.findByRole("tablist", { name: "Client portal" });
        expect(within(parts).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Presentation", "3D", "Drawings", "Client access", "Discussion"]);
        expect(within(parts).getByRole("tab", { name: "Discussion" })).toHaveAttribute("aria-selected", "true");

        // the chat, with each message's side
        const log = await screen.findByRole("log", { name: "Messages" });
        const theirs = (await within(log).findByText("Hello from the client")).closest("li") as HTMLElement;
        expect(within(theirs).getByText("Client")).toBeInTheDocument();
        const ours = within(log).getByText("Welcome aboard").closest("li") as HTMLElement;
        expect(within(ours).getByText("Team")).toBeInTheDocument();

        // the files that have comments
        const row = await screen.findByRole("button", { name: /Living room v3/ });
        expect(within(row).getByText("2")).toBeInTheDocument();
        expect(within(row).getByText("1 new")).toBeInTheDocument();

        // there is nothing to publish from here
        expect(screen.queryByRole("button", { name: "Publish changes" })).toBeNull();
        expect(box.called("GET", "/messages")[0].path).toBe(`${apiBase}/messages`);
    });

    it("writes to the staff address, as one of the team", async () => {
        const { box, handlers } = discussionOf("u2");
        renderApp(discussion, nadia, ...projectWorkHandlers, ...handlers);
        const log = await screen.findByRole("log", { name: "Messages" });
        await within(log).findByText("Welcome aboard");

        await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Shall we meet on Monday?");
        await userEvent.click(screen.getByRole("button", { name: "Send" }));

        const sent = (await within(log).findByText("Shall we meet on Monday?")).closest("li") as HTMLElement;
        expect(within(sent).getByText("Team")).toBeInTheDocument();
        expect(box.called("POST", "/messages").map((c) => c.path)).toEqual([`${apiBase}/messages`]);
    });

    it("says there are no messages without inviting anyone to say hello", async () => {
        const { handlers } = mockDiscussion(STAFF_BASE, { viewer: "u2" });
        renderApp(discussion, nadia, ...projectWorkHandlers, ...handlers);

        expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
        expect(screen.queryByText(/Say hello/)).toBeNull();
        expect(screen.getByText("No comments on files yet.")).toBeInTheDocument();
    });

    it("opens a file's comments in place of the list, with a way back", async () => {
        const { handlers } = discussionOf("u2");
        renderApp(`${discussion}&item=5`, nadia, ...projectWorkHandlers, ...handlers);

        expect(await screen.findByText("Is this the final sofa?")).toBeInTheDocument();
        expect(screen.getByText("Yes, it is the final one")).toBeInTheDocument();
        expect(screen.getByText("Living room v3")).toBeInTheDocument();
        // the list is out of the way while a file's comments are open
        expect(screen.queryByText("Every file clients have commented on, newest first.")).toBeNull();

        const back = screen.getByRole("link", { name: "All comments" });
        expect(back).toHaveAttribute("href", `${page}?tab=portal&part=discussion`);
        await userEvent.click(back);
        expect(await screen.findByText("Every file clients have commented on, newest first.")).toBeInTheDocument();
        expect(screen.queryByText("Is this the final sofa?")).toBeNull();
        expect(window.location.search).toBe("?tab=portal&part=discussion");
    });

    it("opens a file's comments from the list", async () => {
        const { handlers } = discussionOf("u2");
        renderApp(discussion, nadia, ...projectWorkHandlers, ...handlers);

        await userEvent.click(await screen.findByRole("button", { name: /Living room v3/ }));
        expect(await screen.findByText("Is this the final sofa?")).toBeInTheDocument();
        expect(window.location.search).toBe("?tab=portal&part=discussion&item=5");
    });
});

describe("who gets the Client portal tab", () => {
    it("shows an employee who takes part the tab, with the Discussion only", async () => {
        const { handlers } = discussionOf("u4");
        // an employee holds no portal permission at all
        renderApp(`/design/projects/${work.project.id}?tab=portal`, sarah, ...workHandlers, ...handlers);

        expect(await screen.findByRole("tab", { name: "Client portal" })).toBeInTheDocument();
        expect(await screen.findByText("Hello from the client")).toBeInTheDocument();
        // one part only: no bar to choose from, and nothing to publish or to manage
        expect(screen.getByText("Project chat")).toBeInTheDocument();
        expect(screen.queryByRole("tablist", { name: "Client portal" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Publish changes" })).toBeNull();
        expect(screen.queryByText("Client portal access")).toBeNull();
    });

    it("hides the tab from an employee the discussion answers 404 to", async () => {
        let asked = false;
        renderApp(`/design/projects/${work.project.id}?tab=portal&part=discussion`, sarah, ...workHandlers,
            http.get(STAFF_BASE, () => { asked = true; return notAParticipant(); }));

        // a link to the tab waits for the answer, then opens the first tab the person has
        expect(await screen.findByText("Your recent work")).toBeInTheDocument();
        expect(asked).toBe(true);
        expect(screen.queryByRole("tab", { name: "Client portal" })).toBeNull();
        expect(screen.queryByText("Project chat")).toBeNull();
    });

    it("doesn't ask about a project that is not a client's", async () => {
        const internal = { ...work.project, billingType: "internal", client: null };
        let asked = false;
        renderApp(`/design/projects/${work.project.id}`, sarah,
            http.get("/api/projects/:id", () => HttpResponse.json(internal)),
            http.get(STAFF_BASE, () => { asked = true; return HttpResponse.json(summaryOf("u4")); }),
            ...workHandlers);

        expect(await screen.findByRole("tab", { name: "Meetings" })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Client portal" })).toBeNull();
        expect(asked).toBe(false);
    });
});

describe("the content cards", () => {
    const living = itemOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"), { state: "unchanged" });
    const kitchen = itemOf(6, "Kitchen", fileOf(12, "Kitchen.jpg"), { state: "new" });

    it("show a published file's comments and whether some are new, and lead to them", async () => {
        const { handlers } = discussionOf("u2");
        renderApp(part("presentation"), nadia, served(contentOf([living, kitchen])), ...projectWorkHandlers, ...handlers);

        const card = within(await screen.findByRole("article", { name: "Living room v3" }));
        const link = await card.findByRole("link", { name: "Comments on Living room v3: 2, some new" });
        expect(link).toHaveTextContent("2");
        expect(link).toHaveAttribute("href", `${page}?tab=portal&part=discussion&item=5`);
        // a file that was never published has no comments
        expect(within(screen.getByRole("article", { name: "Kitchen" })).queryByRole("link")).toBeNull();

        await userEvent.click(link);
        expect(await screen.findByText("Is this the final sofa?")).toBeInTheDocument();
        expect(window.location.search).toBe("?tab=portal&part=discussion&item=5");
        // the files are another part: this is the Discussion
        expect(screen.queryByRole("button", { name: "Publish changes" })).toBeNull();
    });

    it("show no comments, and the tab no Discussion, to someone who does not take part", async () => {
        let asked = false;
        renderApp(part("presentation"), nadia, served(contentOf([living])), ...projectWorkHandlers,
            http.get(STAFF_BASE, () => { asked = true; return notAParticipant(); }));

        await screen.findByRole("article", { name: "Living room v3" });
        await waitFor(() => expect(asked).toBe(true));
        expect(screen.queryByRole("link", { name: /^Comments on/ })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Discussion" })).toBeNull();
    });
});

describe("the staff's preview of the draft", () => {
    const draft: PortalPresentation = {
        projectId: projectWork.project.id, title: projectWork.project.title, status: "active", summary: null, isPublished: true, publishedAt: null, hero: null,
        sections: [
            {
                section: "presentation",
                items: [{
                    id: 31, title: "Draft sketch", name: "Draft sketch.jpg", contentType: "image/jpeg", preview: "image", sizeBytes: 1024,
                    previewUrl: "/api/content-store/previews/31?sig=a", previewUrlExpiresAt: "2030-01-01T00:00:00Z",
                }],
            },
            { section: "model", items: [] },
            { section: "drawing", items: [] },
        ],
    };

    it("has no comment UI on its cards or in its lightbox, and never asks for the discussion", async () => {
        let asked = false;
        server.use(
            http.get("/api/projects/:id/portal/content/preview", () => HttpResponse.json(draft)),
            http.get(STAFF_BASE, () => { asked = true; return HttpResponse.json(summaryOf("u2", { threads: [threadSummaryOf(31, "Draft sketch")] })); }),
        );
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <MemoryRouter>
                    <PresentationPreview project={projectWork.project} onClose={() => {}} />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        const card = within(await screen.findByRole("article", { name: "Draft sketch" }));
        expect(card.queryByRole("button", { name: /Comment/ })).toBeNull();

        await userEvent.click(card.getByRole("button", { name: "View Draft sketch" }));
        const lightbox = await screen.findByRole("dialog", { name: "Draft sketch" });
        expect(within(lightbox).getByRole("button", { name: "Download" })).toBeInTheDocument();
        expect(within(lightbox).queryByRole("button", { name: /Comment/ })).toBeNull();
        expect(within(lightbox).queryByRole("complementary")).toBeNull();
        expect(asked).toBe(false);
    });
});
