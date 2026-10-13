import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { PortalAuthResponse } from "./portalApi";
import { resetLinks } from "./presentation/presentationLinks";
import type { PortalPresentation, PresentationItem } from "./presentation/presentationTypes";

/*
 * A client's project page: the published presentation (hero, introduction and the three sections), its lightbox, and the
 * links to its files, which come from the portal API with the portal's own token.
 */

const MB = 1024 * 1024;
const auth: PortalAuthResponse = {
    accessToken: "portal-token",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    account: { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [{ id: 2, title: "Villa Mounir interiors", status: "active" }] },
};
const signedIn = http.post("/api/portal/auth/refresh", () => HttpResponse.json(auth));

const itemOf = (id: number, title: string, over: Partial<PresentationItem> = {}): PresentationItem => ({
    id, title, name: `${title}.jpg`, contentType: "image/jpeg", preview: "image", sizeBytes: 2 * MB,
    previewUrl: `/api/content-store/previews/${id}?sig=a`, previewUrlExpiresAt: "2030-01-01T00:00:00Z", ...over,
});
const fileOf = (id: number, title: string, name: string, over: Partial<PresentationItem> = {}) =>
    itemOf(id, title, { name, contentType: "application/pdf", preview: "pdf", sizeBytes: 3 * MB, previewUrl: null, previewUrlExpiresAt: null, ...over });

const living = itemOf(11, "Living room");
const brochure = fileOf(14, "Brochure", "brochure.pdf");
const kitchen = itemOf(12, "Kitchen");
const walkthrough = itemOf(13, "Walkthrough", { name: "walk.mp4", contentType: "video/mp4", preview: "video" });
const plan = fileOf(21, "Ground floor plan", "plan-ground.pdf");
const site = fileOf(22, "Site model", "site.dwg", { contentType: "application/octet-stream", preview: "none", sizeBytes: 1.5 * MB });

const published: PortalPresentation = {
    projectId: 2, title: "Villa Mounir interiors", status: "active",
    summary: "A calm, warm home for the family.\n\nTwo bedrooms and <b>one</b> open kitchen.",
    isPublished: true, publishedAt: "2026-10-01T09:00:00Z",
    hero: { url: "/api/content-store/previews/90?sig=h", urlExpiresAt: "2030-01-01T00:00:00Z", name: "hero.jpg" },
    sections: [
        { section: "presentation", items: [living, brochure, kitchen, walkthrough] },
        { section: "model", items: [] },
        { section: "drawing", items: [plan, site] },
    ],
};
const served = (body: PortalPresentation = published) => http.get("/api/portal/projects/:id", () => HttpResponse.json(body));
const heading = () => screen.findByRole("heading", { level: 1, name: "Villa Mounir interiors" });
const titlesIn = (section: string) =>
    within(screen.getByRole("region", { name: section })).queryAllByRole("article").map((a) => a.getAttribute("aria-label"));

// the same links every time, as far as these tests go
beforeEach(resetLinks);

describe("a client's project page", () => {
    it("shows the hero, the title, the introduction and the three sections with their items in order", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());

        expect(await heading()).toBeInTheDocument();
        expect(document.querySelector(".pp-hero img")).toHaveAttribute("src", "/api/content-store/previews/90?sig=h");
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Updated Oct 1, 2026")).toBeInTheDocument();
        expect(screen.getByText("A calm, warm home for the family.")).toBeInTheDocument();
        // plain text, never HTML
        expect(screen.getByText("Two bedrooms and <b>one</b> open kitchen.")).toBeInTheDocument();

        expect(titlesIn("Presentation")).toEqual(["Living room", "Brochure", "Kitchen", "Walkthrough"]);
        expect(titlesIn("3D")).toEqual([]);
        expect(titlesIn("Drawings")).toEqual(["Ground floor plan", "Site model"]);
        expect(within(screen.getByRole("region", { name: "3D" })).getByText("Nothing here yet")).toBeInTheDocument();

        // a PDF and another file carry their file name and size, an image only its title
        const planCard = within(screen.getByRole("article", { name: "Ground floor plan" }));
        expect(planCard.getByText("plan-ground.pdf")).toBeInTheDocument();
        expect(planCard.getByText("3 MB")).toBeInTheDocument();
        expect(planCard.getByText("PDF")).toBeInTheDocument();
        const siteCard = within(screen.getByRole("article", { name: "Site model" }));
        expect(siteCard.getByText("DWG")).toBeInTheDocument();
        expect(siteCard.getByText("1.5 MB")).toBeInTheDocument();
        expect(siteCard.queryByRole("button", { name: /^Open/ })).toBeNull();
        expect(within(screen.getByRole("article", { name: "Kitchen" })).queryByText("Kitchen.jpg")).toBeNull();

        // wide screens: a menu to the sections, and no phone picker
        const menu = screen.getByRole("navigation", { name: "Sections" });
        expect(within(menu).getAllByRole("link").map((l) => l.textContent)).toEqual(["Presentation", "3D", "Drawings"]);
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(within(menu).getByRole("link", { name: "Presentation" })).toHaveAttribute("aria-current", "location");
        await userEvent.click(within(menu).getByRole("link", { name: "Drawings" }));
        expect(within(menu).getByRole("link", { name: "Drawings" })).toHaveAttribute("aria-current", "location");
        expect(window.location.hash).toBe("");
    });

    it("opens an image in the lightbox and moves through the images and videos of its section", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());
        await userEvent.click(await screen.findByRole("button", { name: "View Living room" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("1 of 3")).toBeInTheDocument();
        expect(within(dialog).getByRole("img", { name: "Living room" })).toHaveAttribute("src", "/api/content-store/previews/11?sig=a");
        expect(within(dialog).getByRole("button", { name: "Download" })).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(dialog).toHaveFocus();

        await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
        expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
        expect(within(dialog).getByText("Kitchen")).toBeInTheDocument();
        expect(within(dialog).getByRole("img", { name: "Kitchen" })).toBeInTheDocument();

        // the keyboard: the next is the video, with controls
        await userEvent.keyboard("{ArrowRight}");
        expect(within(dialog).getByText("3 of 3")).toBeInTheDocument();
        expect(dialog.querySelector("video")).toHaveAttribute("src", "/api/content-store/previews/13?sig=a");
        expect(dialog.querySelector("video")).toHaveAttribute("controls");
        expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();

        await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
        expect(within(dialog).getByText("1 of 3")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens a video tile in the lightbox, and only the section's images and videos are in it", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());
        await userEvent.click(await screen.findByRole("button", { name: "View Walkthrough" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("3 of 3")).toBeInTheDocument();
        expect(dialog.querySelector("video")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("asks the portal for a link to open a PDF or to save a file, with the portal's token", async () => {
        const asked: { path: string; inline: string | null; authorization: string | null }[] = [];
        const followed: { href: string; target: string; rel: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push({ href: this.getAttribute("href") ?? "", target: this.target, rel: this.rel, download: this.download });
        });
        // a staff member is signed in in the same browser: their token must never go to the portal
        renderApp("/portal/projects/2", personas.designAdmin, signedIn, served(),
            http.get("/api/portal/projects/:id/items/:itemId/link", ({ request }) => {
                const url = new URL(request.url);
                const inline = url.searchParams.get("inline");
                asked.push({ path: url.pathname, inline, authorization: request.headers.get("authorization") });
                return HttpResponse.json({ url: `/api/content-store/objects/x?inline=${inline}`, expiresAt: "2030-01-01T00:05:00Z" });
            }));

        await userEvent.click(await screen.findByRole("button", { name: "Open Brochure" }));
        await waitFor(() => expect(followed).toHaveLength(1));
        expect(followed[0]).toMatchObject({ href: "/api/content-store/objects/x?inline=true", target: "_blank", rel: "noopener" });

        await userEvent.click(screen.getByRole("button", { name: "Download Site model" }));
        await waitFor(() => expect(followed).toHaveLength(2));
        expect(followed[1]).toMatchObject({ href: "/api/content-store/objects/x?inline=false", download: "site.dwg" });

        await userEvent.click(screen.getByRole("button", { name: "Download Brochure" }));
        await waitFor(() => expect(followed).toHaveLength(3));

        expect(asked).toEqual([
            { path: "/api/portal/projects/2/items/14/link", inline: "true", authorization: "Bearer portal-token" },
            { path: "/api/portal/projects/2/items/22/link", inline: "false", authorization: "Bearer portal-token" },
            { path: "/api/portal/projects/2/items/14/link", inline: "false", authorization: "Bearer portal-token" },
        ]);
    });

    it("saves a picture from the lightbox through the same link", async () => {
        const asked: string[] = [];
        const followed: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push(`${this.getAttribute("href")} ${this.download}`);
        });
        renderApp("/portal/projects/2", null, signedIn, served(),
            http.get("/api/portal/projects/:id/items/:itemId/link", ({ request, params }) => {
                asked.push(`${params.itemId} ${new URL(request.url).searchParams.get("inline")}`);
                return HttpResponse.json({ url: "/api/content-store/objects/kitchen", expiresAt: "2030-01-01T00:05:00Z" });
            }));

        await userEvent.click(await screen.findByRole("button", { name: "View Kitchen" }));
        await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Download" }));
        await waitFor(() => expect(followed).toHaveLength(1));
        expect(followed[0]).toBe("/api/content-store/objects/kitchen Kitchen.jpg");
        expect(asked).toEqual(["12 false"]);
    });

    it("tells the client when nothing has been shared yet", async () => {
        const empty: PortalPresentation = {
            ...published, isPublished: false, publishedAt: null, summary: null, hero: null,
            sections: published.sections.map((s) => ({ ...s, items: [] })),
        };
        renderApp("/portal/projects/2", null, signedIn, served(empty));

        expect(await screen.findByText("Your project team hasn't shared anything here yet.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Villa Mounir interiors" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Presentation" })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    });

    it("says a project isn't available when the portal answers 404, whatever the reason", async () => {
        renderApp("/portal/projects/9", null, signedIn,
            http.get("/api/portal/projects/:id", () => HttpResponse.json({ type: "not_found", code: "not_found", message: "Not found." }, { status: 404 })));

        expect(await screen.findByText("This project isn't available")).toBeInTheDocument();
        expect(screen.getByText("If you think you should see it, ask your project contact.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Back to your projects" })).toHaveAttribute("href", "/portal");
    });

    it("doesn't ask the server for an address that isn't a project", async () => {
        let asked = false;
        renderApp("/portal/projects/abc", null, signedIn, http.get("/api/portal/projects/:id", () => { asked = true; return HttpResponse.json(published); }));
        expect(await screen.findByText("This project isn't available")).toBeInTheDocument();
        expect(asked).toBe(false);
    });

    it("shows any other failure with a way to try again", async () => {
        let failing = true;
        renderApp("/portal/projects/2", null, signedIn,
            http.get("/api/portal/projects/:id", () => failing
                ? HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed right now." }, { status: 403 })
                : HttpResponse.json(published)));

        expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed right now.");
        failing = false;
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await heading()).toBeInTheDocument();
    });

    it("loads the page again, once, when an image's link has run out", async () => {
        let loads = 0;
        renderApp("/portal/projects/2", null, signedIn, http.get("/api/portal/projects/:id", () => { loads++; return HttpResponse.json(published); }));
        await heading();
        expect(loads).toBe(1);

        const pictures = document.querySelectorAll(".pp-grid img");
        expect(pictures).toHaveLength(2);
        fireEvent.error(pictures[0]);
        fireEvent.error(pictures[1]);
        await waitFor(() => expect(loads).toBe(2));

        // a picture that still won't load doesn't ask again
        const hero = document.querySelector(".pp-hero img");
        expect(hero).not.toBeNull();
        fireEvent.error(hero!);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(loads).toBe(2);
    });
});

describe("the client portal's start page", () => {
    it("links each project to its page, and back", async () => {
        renderApp("/portal", null, signedIn, served());

        const card = await screen.findByRole("link", { name: /Villa Mounir interiors/ });
        expect(card).toHaveAttribute("href", "/portal/projects/2");
        expect(screen.queryByText(/will appear here/)).toBeNull();

        await userEvent.click(card);
        expect(await heading()).toBeInTheDocument();
        expect(window.location.pathname).toBe("/portal/projects/2");

        await userEvent.click(screen.getByRole("link", { name: "All projects" }));
        expect(await screen.findByRole("heading", { name: "Welcome, Rania" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/portal");
    });
});

describe("a client's project page on a phone", () => {
    beforeEach(() => {
        vi.stubGlobal("matchMedia", (query: string) => ({
            matches: query === "(max-width: 640px)", addEventListener: () => {}, removeEventListener: () => {},
        }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it("shows one section at a time, chosen from a bar", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());

        const picker = await screen.findByRole("tablist", { name: "Sections" });
        expect(within(picker).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Presentation", "3D", "Drawings"]);
        expect(within(picker).getByRole("tab", { name: "Presentation" })).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Living room", "Brochure", "Kitchen", "Walkthrough"]);

        await userEvent.click(within(picker).getByRole("tab", { name: "3D" }));
        expect(screen.queryAllByRole("article")).toEqual([]);
        expect(screen.getByText("Nothing here yet")).toBeInTheDocument();

        await userEvent.click(within(picker).getByRole("tab", { name: "Drawings" }));
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Ground floor plan", "Site model"]);
    });
});
