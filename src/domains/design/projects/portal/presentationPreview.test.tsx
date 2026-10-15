import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLinks } from "@/portal/presentation/presentationLinks";
import type { PortalPresentation, PresentationItem } from "@/portal/presentation/presentationTypes";
import { projectWork } from "@/test/fixtures/project";
import { server } from "@/test/server";
import PresentationPreview from "./PresentationPreview";

/*
 * The staff's preview of a project's page from its draft: the client's own page, over the app, with a banner that says
 * so. The draft comes from the staff API and its files' links from the staff link endpoint.
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
const draft: PortalPresentation = {
    projectId: project.id, title: project.title, status: "active", summary: "Still being written.",
    isPublished: true, publishedAt: null,
    hero: { url: "/api/content-store/previews/91?sig=h", urlExpiresAt: "2030-01-01T00:00:00Z", name: "hero.jpg" },
    sections: [
        { section: "presentation", items: [sketch] },
        { section: "model", items: [] },
        { section: "drawing", items: [draftPlan] },
    ],
};
const served = (body: PortalPresentation = draft) => http.get(`${base}/preview`, () => HttpResponse.json(body));

function renderPreview(onClose = vi.fn(), ...handlers: RequestHandler[]) {
    server.use(...handlers);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <PresentationPreview project={project} onClose={onClose} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onClose, ...view };
}

beforeEach(resetLinks);

describe("the preview of a project's draft", () => {
    it("shows the draft banner and the draft's items, as the client's page, and closes", async () => {
        const { onClose } = renderPreview(vi.fn(), served());

        expect(screen.getByText("Preview of your draft. Clients won't see these changes until you publish.")).toBeInTheDocument();
        expect(screen.getByRole("dialog", { name: `Draft preview of ${project.title}` })).toHaveFocus();

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

        await userEvent.click(screen.getByRole("button", { name: "Close preview" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("locks the page behind it while it is open", async () => {
        const { unmount } = renderPreview(vi.fn(), served());
        await screen.findByRole("heading", { level: 1 });
        expect(document.body.style.overflow).toBe("hidden");
        unmount();
        expect(document.body.style.overflow).toBe("");
    });

    it("closes with Escape, unless a picture is open over it: that closes first", async () => {
        const { onClose } = renderPreview(vi.fn(), served());
        await userEvent.click(await screen.findByRole("button", { name: "View Draft sketch" }));
        expect(await screen.findByRole("dialog", { name: "Draft sketch" })).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Draft sketch" })).toBeNull();
        expect(onClose).not.toHaveBeenCalled();

        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks the staff link endpoint for the draft's files", async () => {
        const asked: string[] = [];
        const followed: { href: string; target: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push({ href: this.getAttribute("href") ?? "", target: this.target, download: this.download });
        });
        renderPreview(vi.fn(), served(), http.get(`${base}/items/:itemId/link`, ({ request }) => {
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
        renderPreview(vi.fn(), http.get(`${base}/preview`, () => ++calls === 1
            ? HttpResponse.json({ type: "error", code: "internal_error", message: "The draft can't be read just now." }, { status: 500 })
            : HttpResponse.json(draft)));

        expect(screen.getByLabelText("Loading")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("The draft can't be read just now.");
        // the banner and its button are there even then
        expect(screen.getByRole("button", { name: "Close preview" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
        expect(calls).toBe(2);
    });

    it("says so when the draft has nothing in it yet", async () => {
        renderPreview(vi.fn(), served({ ...draft, summary: null, hero: null, sections: draft.sections.map((s) => ({ ...s, items: [] })) }));
        expect(await screen.findByText("Nothing to preview yet")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Close preview" })).toBeInTheDocument();
    });
});
