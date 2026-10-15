import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLinks } from "@/portal/presentation/presentationLinks";
import type { PortalPresentation, PresentationItem } from "@/portal/presentation/presentationTypes";
import { projectWork } from "@/test/fixtures/project";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { server } from "@/test/server";
import PresentationPreview from "./PresentationPreview";
import { previewPath } from "./previewApi";
import { publisher } from "./portalTestKit";

/*
 * The staff's preview of a project's page from its draft: the client's own page, in a browser tab of its own, under a
 * banner that says so. The draft comes from the staff API and its files' links from the staff link endpoint.
 */

const MB = 1024 * 1024;
const project = projectWork.project;
const base = "/api/projects/:id/portal/content";

const itemOf = (id: number, title: string, over: Partial<PresentationItem> = {}): PresentationItem => ({
    id, title, name: `${title}.jpg`, contentType: "image/jpeg", preview: "image", sizeBytes: 2 * MB,
    previewUrl: `/api/content-store/previews/${id}?sig=a`, previewUrlExpiresAt: "2030-01-01T00:00:00Z", ...over,
});
const sketch = itemOf(31, "Draft sketch");
const draftPlan = itemOf(32, "Draft plan", { name: "draft-plan.pdf", contentType: "application/pdf", preview: "pdf", previewUrl: null, previewUrlExpiresAt: null });
const hero = { url: "/api/content-store/previews/91?sig=h", urlExpiresAt: "2030-01-01T00:00:00Z", name: "hero.jpg" };
const draft: PortalPresentation = {
    projectId: project.id, title: project.title, status: "active", summary: "Still being written.",
    isPublished: true, publishedAt: null, hero, heroes: [hero],
    sections: [
        { section: "presentation", items: [sketch] },
        { section: "model", items: [] },
        { section: "drawing", items: [draftPlan] },
    ],
};
const served = (body: PortalPresentation = draft) => http.get(`${base}/preview`, () => HttpResponse.json(body));

function renderPreview(...handlers: RequestHandler[]) {
    server.use(...handlers);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <PresentationPreview projectId={project.id} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(resetLinks);
afterEach(() => vi.restoreAllMocks());

describe("the preview of a project's draft", () => {
    it("shows the banner and the draft's items, as the client's page, and Close closes the tab", async () => {
        const close = vi.spyOn(window, "close").mockImplementation(() => {});
        renderPreview(served());

        const banner = screen.getByRole("region", { name: "Preview" });
        expect(within(banner).getByText("Preview — what the client would see")).toBeInTheDocument();
        expect(within(banner).getByText("Clients won't see your draft until you publish.")).toBeInTheDocument();

        expect(await screen.findByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
        expect(screen.getByText("Still being written.")).toBeInTheDocument();
        expect(document.querySelector(".pp-hero img")).toHaveAttribute("src", "/api/content-store/previews/91?sig=h");
        const titles = (section: string) =>
            within(screen.getByRole("region", { name: section })).queryAllByRole("article").map((a) => a.getAttribute("aria-label"));
        expect(titles("Presentation")).toEqual(["Draft sketch"]);
        expect(titles("3D")).toEqual([]);
        expect(titles("Drawings")).toEqual(["Draft plan"]);

        // the client's page has nothing to edit, and neither has its preview
        expect(screen.queryByRole("button", { name: /Rename|Delete|Publish|Replace|Upload|Move|Remove/ })).toBeNull();

        await userEvent.click(within(banner).getByRole("button", { name: "Close" }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("closes an open picture with Escape, and stays open itself", async () => {
        renderPreview(served());
        await userEvent.click(await screen.findByRole("button", { name: "View Draft sketch" }));
        expect(await screen.findByRole("dialog", { name: "Draft sketch" })).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Draft sketch" })).toBeNull();
        expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();
    });

    it("asks the staff link endpoint for the draft's files", async () => {
        const asked: string[] = [];
        const followed: { href: string; target: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push({ href: this.getAttribute("href") ?? "", target: this.target, download: this.download });
        });
        renderPreview(served(), http.get(`${base}/items/:itemId/link`, ({ request }) => {
            const url = new URL(request.url);
            asked.push(`${url.pathname}?inline=${url.searchParams.get("inline")}`);
            return HttpResponse.json({ url: `/api/content-store/objects/plan?inline=${url.searchParams.get("inline")}`, expiresAt: "2030-01-01T00:05:00Z" });
        }));

        await userEvent.click(await screen.findByRole("button", { name: "Open Draft plan" }));
        await waitFor(() => expect(followed).toHaveLength(1));
        expect(followed[0]).toMatchObject({ href: "/api/content-store/objects/plan?inline=true", target: "_blank" });

        await userEvent.click(screen.getByRole("button", { name: "Download Draft plan" }));
        await waitFor(() => expect(followed).toHaveLength(2));
        expect(followed[1]).toMatchObject({ href: "/api/content-store/objects/plan?inline=false", download: "draft-plan.pdf" });
        expect(asked).toEqual([
            `/api/projects/${project.id}/portal/content/items/32/link?inline=true`,
            `/api/projects/${project.id}/portal/content/items/32/link?inline=false`,
        ]);
    });

    it("shows a skeleton while it loads, and a failure with a way to try again", async () => {
        let calls = 0;
        renderPreview(http.get(`${base}/preview`, () => ++calls === 1
            ? HttpResponse.json({ type: "error", code: "internal_error", message: "The draft can't be read just now." }, { status: 500 })
            : HttpResponse.json(draft)));

        expect(screen.getByLabelText("Loading")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("The draft can't be read just now.");
        // the banner and its button are there even then
        expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
        expect(calls).toBe(2);
    });

    it("says so when the draft has nothing in it yet", async () => {
        renderPreview(served({ ...draft, summary: null, hero: null, heroes: [], sections: draft.sections.map((s) => ({ ...s, items: [] })) }));
        expect(await screen.findByText("Nothing to preview yet")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });
});

describe("the preview's own page", () => {
    it("shows the client's page alone, without the staff app around it", async () => {
        renderApp(previewPath(project.id), publisher, served());

        expect(await screen.findByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();
        // no sidebar, no top bar
        expect(document.querySelector(".side")).toBeNull();
        expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    });

    it("opens for an admin who invites the client, without client_portal:manage", async () => {
        renderApp(previewPath(project.id), personas.designAdmin, served());
        expect(await screen.findByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
    });

    it("tells someone who doesn't see the client's files that it isn't theirs, without asking for the draft", async () => {
        let asked = false;
        renderApp(previewPath(project.id), personas.designEmployee, http.get(`${base}/preview`, () => { asked = true; return HttpResponse.json(draft); }));
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(asked).toBe(false);
    });
});
