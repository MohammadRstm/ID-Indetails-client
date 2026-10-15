import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { PortalAuthResponse } from "./portalApi";
import { resetLinks } from "./presentation/presentationLinks";
import type { PortalPresentation, PresentationHero, PresentationItem } from "./presentation/presentationTypes";

/*
 * A client's project page: the published presentation (the hero images with the title and introduction, the sections'
 * bar and the three sections), its lightbox and its file cards, and the links to its files, which come from the portal
 * API with the portal's own token.
 */

const MB = 1024 * 1024;
const auth: PortalAuthResponse = {
    accessToken: "portal-token",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    account: { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [{ id: 2, title: "Villa Mounir interiors", status: "active", unread: 0 }] },
};
const signedIn = http.post("/api/portal/auth/refresh", () => HttpResponse.json(auth));

const itemOf = (id: number, title: string, over: Partial<PresentationItem> = {}): PresentationItem => ({
    id, title, name: `${title}.jpg`, contentType: "image/jpeg", preview: "image", sizeBytes: 2 * MB,
    previewUrl: `/api/content-store/previews/${id}?sig=a`, previewUrlExpiresAt: "2030-01-01T00:00:00Z", ...over,
});
const fileOf = (id: number, title: string, name: string, over: Partial<PresentationItem> = {}) =>
    itemOf(id, title, { name, contentType: "application/pdf", preview: "pdf", sizeBytes: 3 * MB, previewUrl: null, previewUrlExpiresAt: null, ...over });
const videoOf = (id: number, title: string) => itemOf(id, title, { name: `${title}.mp4`, contentType: "video/mp4", preview: "video" });
const heroOf = (n: number): PresentationHero => ({ url: `/api/content-store/previews/9${n}?sig=h`, urlExpiresAt: "2030-01-01T00:00:00Z", name: `hero-${n}.jpg` });

const living = itemOf(11, "Living room");
const brochure = fileOf(14, "Brochure", "brochure.pdf");
const kitchen = itemOf(12, "Kitchen");
const walkthrough = videoOf(13, "Walkthrough");
const plan = fileOf(21, "Ground floor plan", "plan-ground.pdf");
const site = fileOf(22, "Site model", "site.dwg", { contentType: "application/octet-stream", preview: "none", sizeBytes: 1.5 * MB });

const published: PortalPresentation = {
    projectId: 2, title: "Villa Mounir interiors", status: "active",
    summary: "A calm, warm home for the family.\n\nTwo bedrooms and <b>one</b> open kitchen.",
    isPublished: true, publishedAt: "2026-10-01T09:00:00Z",
    hero: heroOf(0), heroes: [heroOf(0)],
    sections: [
        { section: "presentation", items: [living, brochure, kitchen, walkthrough] },
        { section: "model", items: [] },
        { section: "drawing", items: [plan, site] },
    ],
};
/** The published presentation with these items in a section. */
const withSection = (section: "presentation" | "model" | "drawing", items: PresentationItem[], over: Partial<PortalPresentation> = {}): PortalPresentation => ({
    ...published, ...over, sections: published.sections.map((s) => (s.section === section ? { ...s, items } : s)),
});
const served = (body: PortalPresentation = published) => http.get("/api/portal/projects/:id", () => HttpResponse.json(body));
const heading = () => screen.findByRole("heading", { level: 1, name: "Villa Mounir interiors" });
const region = (section: string) => within(screen.getByRole("region", { name: section }));
const titlesIn = (section: string) => region(section).queryAllByRole("article").map((a) => a.getAttribute("aria-label"));
const kindCard = (label: string) => screen.findByRole("button", { name: new RegExp(`^${label}`) });

// the same links every time, as far as these tests go
beforeEach(resetLinks);
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("a client's project page", () => {
    it("shows the hero with the title and introduction on it, the sections' bar, and the three sections", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());

        const title = await heading();
        expect(document.querySelector(".pp-hero img")).toHaveAttribute("src", "/api/content-store/previews/90?sig=h");
        // the title and the introduction sit on the picture
        const onPicture = title.closest(".pp-hero-main") as HTMLElement;
        expect(onPicture).not.toBeNull();
        expect(within(onPicture).getByText("Active")).toBeInTheDocument();
        expect(within(onPicture).getByText("Updated Oct 1, 2026")).toBeInTheDocument();
        expect(within(onPicture).getByText("A calm, warm home for the family.")).toBeInTheDocument();
        // plain text, never HTML
        expect(within(onPicture).getByText("Two bedrooms and <b>one</b> open kitchen.")).toBeInTheDocument();

        // the pictures in their grid; the PDF and the video in cards of their own kind
        expect(titlesIn("Presentation")).toEqual(["Living room", "Kitchen"]);
        expect(region("Presentation").getByRole("button", { name: "PDFs and documents Brochure" })).toBeInTheDocument();
        expect(region("Presentation").getByRole("button", { name: "Videos Walkthrough" })).toBeInTheDocument();
        expect(region("Presentation").queryByRole("button", { name: /^Other files/ })).toBeNull();
        expect(within(screen.getByRole("article", { name: "Kitchen" })).queryByText("Kitchen.jpg")).toBeNull();
        expect(titlesIn("3D")).toEqual([]);
        expect(region("3D").getByText("Nothing here yet")).toBeInTheDocument();

        // Drawings has no pictures: its files as small cards, with their name, size and type's icon
        expect(titlesIn("Drawings")).toEqual(["Ground floor plan", "Site model"]);
        const planCard = within(screen.getByRole("article", { name: "Ground floor plan" }));
        expect(planCard.getByText("plan-ground.pdf")).toBeInTheDocument();
        expect(planCard.getByText("3 MB")).toBeInTheDocument();
        expect(screen.getByRole("article", { name: "Ground floor plan" }).querySelector(".pp-file-icon.pdf")).not.toBeNull();
        const siteCard = within(screen.getByRole("article", { name: "Site model" }));
        expect(siteCard.getByText("DWG")).toBeInTheDocument();
        expect(siteCard.getByText("1.5 MB")).toBeInTheDocument();
        expect(siteCard.queryByRole("button", { name: /^Open/ })).toBeNull();

        // wide screens: the bar's menu to the sections, and no phone picker
        const menu = screen.getByRole("navigation", { name: "Sections" });
        expect(menu.closest(".pp-bar")).not.toBeNull();
        expect(within(menu).getAllByRole("link").map((l) => l.textContent)).toEqual(["Presentation", "3D", "Drawings"]);
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(within(menu).getByRole("link", { name: "Presentation" })).toHaveAttribute("aria-current", "location");
        await userEvent.click(within(menu).getByRole("link", { name: "Drawings" }));
        expect(within(menu).getByRole("link", { name: "Drawings" })).toHaveAttribute("aria-current", "location");
        expect(window.location.hash).toBe("");
    });

    it("opens a picture in the lightbox and moves through the pictures of the grid", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());
        await userEvent.click(await screen.findByRole("button", { name: "View Living room" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("1 of 2")).toBeInTheDocument();
        expect(within(dialog).getByRole("img", { name: "Living room" })).toHaveAttribute("src", "/api/content-store/previews/11?sig=a");
        expect(within(dialog).getByRole("button", { name: "Download" })).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(dialog).toHaveFocus();

        await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
        expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();
        expect(within(dialog).getByText("Kitchen")).toBeInTheDocument();
        expect(within(dialog).getByRole("img", { name: "Kitchen" })).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();

        await userEvent.keyboard("{ArrowLeft}");
        expect(within(dialog).getByText("1 of 2")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("plays a single video straight from its card, in the lightbox with Download above it", async () => {
        renderApp("/portal/projects/2", null, signedIn, served());
        await userEvent.click(await kindCard("Videos"));

        const dialog = await screen.findByRole("dialog", { name: "Walkthrough" });
        expect(within(dialog).getByText("1 of 1")).toBeInTheDocument();
        const video = dialog.querySelector("video");
        expect(video).toHaveAttribute("src", "/api/content-store/previews/13?sig=a");
        expect(video).toHaveAttribute("controls");
        expect(video).toHaveAttribute("autoplay");
        expect(within(dialog).getByRole("button", { name: "Download" })).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("lists a kind's files to pick from when it has several, each with what it does", async () => {
        const specs = fileOf(15, "Specifications", "specs.docx", { contentType: "application/msword", preview: "none" });
        const tour = videoOf(16, "Tour");
        const sketchUp = fileOf(17, "Model", "model.skp", { contentType: "application/octet-stream", preview: "none" });
        renderApp("/portal/projects/2", null, signedIn, served(withSection("presentation", [living, brochure, specs, walkthrough, tour, sketchUp])));

        // PDFs and Word documents in one card, with the red PDF icon and how many
        const documents = await kindCard("PDFs and documents");
        expect(documents).toHaveTextContent("2 files");
        expect(documents.querySelector(".pp-kind-icon.document")).not.toBeNull();
        expect(documents).toHaveAttribute("aria-expanded", "false");
        await userEvent.click(documents);
        expect(documents).toHaveAttribute("aria-expanded", "true");
        const list = within(screen.getByRole("group", { name: "PDFs and documents" }));
        expect(list.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Brochure", "Specifications"]);
        // a PDF opens in the browser or saves; a Word document saves
        expect(list.getByRole("button", { name: "Open Brochure" })).toBeInTheDocument();
        expect(list.getByRole("button", { name: "Download Brochure" })).toBeInTheDocument();
        expect(list.queryByRole("button", { name: "Open Specifications" })).toBeNull();
        expect(list.getByRole("button", { name: "Download Specifications" })).toBeInTheDocument();
        expect(within(screen.getByRole("article", { name: "Specifications" })).getByText("DOCX")).toBeInTheDocument();
        // Escape closes the list
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("group", { name: "PDFs and documents" })).toBeNull();

        // the videos: Play opens the lightbox on the one picked, and it moves through the videos
        await userEvent.click(await kindCard("Videos"));
        await userEvent.click(within(screen.getByRole("group", { name: "Videos" })).getByRole("button", { name: "Play Tour" }));
        const dialog = await screen.findByRole("dialog", { name: "Tour" });
        expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Videos" })).toBeNull();
        await userEvent.keyboard("{Escape}");

        // anything else in a card of its own
        await userEvent.click(await kindCard("Other files"));
        const others = within(screen.getByRole("group", { name: "Other files" }));
        expect(others.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Model"]);
        expect(others.getByRole("button", { name: "Download Model" })).toBeInTheDocument();
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

        // the one document: its card shows its Open and Download
        await userEvent.click(await kindCard("PDFs and documents"));
        await userEvent.click(screen.getByRole("button", { name: "Open Brochure" }));
        await waitFor(() => expect(followed).toHaveLength(1));
        expect(followed[0]).toMatchObject({ href: "/api/content-store/objects/x?inline=true", target: "_blank", rel: "noopener" });

        await waitFor(() => expect(screen.getByRole("button", { name: "Download Brochure" })).toBeEnabled());
        await userEvent.click(screen.getByRole("button", { name: "Download Brochure" }));
        await waitFor(() => expect(followed).toHaveLength(2));

        await userEvent.click(screen.getByRole("button", { name: "Download Site model" }));
        await waitFor(() => expect(followed).toHaveLength(3));
        expect(followed[2]).toMatchObject({ href: "/api/content-store/objects/x?inline=false", download: "site.dwg" });

        expect(asked).toEqual([
            { path: "/api/portal/projects/2/items/14/link", inline: "true", authorization: "Bearer portal-token" },
            { path: "/api/portal/projects/2/items/14/link", inline: "false", authorization: "Bearer portal-token" },
            { path: "/api/portal/projects/2/items/22/link", inline: "false", authorization: "Bearer portal-token" },
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
            ...published, isPublished: false, publishedAt: null, summary: null, hero: null, heroes: [],
            sections: published.sections.map((s) => ({ ...s, items: [] })),
        };
        renderApp("/portal/projects/2", null, signedIn, served(empty));

        expect(await screen.findByText("Your project team hasn't shared anything here yet.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Villa Mounir interiors" })).toBeInTheDocument();
        // no picture: the title in its calm block
        expect(document.querySelector(".pp-hero.plain")).not.toBeNull();
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

    it("loads the page again for a link that runs out later, too", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        let loads = 0;
        renderApp("/portal/projects/2", null, signedIn, http.get("/api/portal/projects/:id", () => { loads++; return HttpResponse.json(published); }));
        await heading();
        // a picture that failed shows its tile, so whichever picture is still there
        const aPicture = () => document.querySelector(".pp-grid img") ?? document.querySelector(".pp-hero img");
        fireEvent.error(aPicture()!);
        await waitFor(() => expect(loads).toBe(2));

        // an hour on, the links of that answer run out as well
        vi.setSystemTime(Date.now() + 61 * 60_000);
        await waitFor(() => expect(aPicture()).not.toBeNull());
        fireEvent.error(aPicture()!);
        await waitFor(() => expect(loads).toBe(3));
    });
});

describe("the hero images", () => {
    const six = [1, 2, 3, 4, 5, 6].map(heroOf);

    it("show the first big and four beside it, with +N for the rest, and open a gallery of them all", async () => {
        renderApp("/portal/projects/2", null, signedIn, served({ ...published, hero: six[0], heroes: six }));
        await heading();

        const pictures = Array.from(document.querySelectorAll(".pp-hero img"), (img) => img.getAttribute("src"));
        expect(pictures).toEqual(six.slice(0, 5).map((h) => h.url));
        expect(document.querySelector(".pp-hero-main img")).toHaveAttribute("src", six[0].url);
        expect(document.querySelectorAll(".pp-hero-side")).toHaveLength(4);
        const last = screen.getByRole("button", { name: "View picture 5 of 6, and 1 more" });
        expect(last).toHaveTextContent("+1");

        await userEvent.click(screen.getByRole("button", { name: "View picture 3 of 6" }));
        const gallery = await screen.findByRole("dialog", { name: "Villa Mounir interiors" });
        expect(within(gallery).getByText("3 of 6")).toBeInTheDocument();
        expect(within(gallery).getByRole("img")).toHaveAttribute("src", six[2].url);
        // they aren't files of the project: nothing to download
        expect(within(gallery).queryByRole("button", { name: "Download" })).toBeNull();

        await userEvent.click(within(gallery).getByRole("button", { name: "Next" }));
        expect(within(gallery).getByText("4 of 6")).toBeInTheDocument();
        // the sixth, behind the +1, is in it too
        await userEvent.keyboard("{ArrowRight}{ArrowRight}");
        expect(within(gallery).getByText("6 of 6")).toBeInTheDocument();
        expect(within(gallery).getByRole("img")).toHaveAttribute("src", six[5].url);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "View the pictures, 1 of 6" }));
        expect(within(await screen.findByRole("dialog")).getByText("1 of 6")).toBeInTheDocument();
    });

    it("give way to the next when one won't load, and to the title's calm block when none will", async () => {
        renderApp("/portal/projects/2", null, signedIn, served({ ...published, hero: six[0], heroes: six.slice(0, 2) }));
        await heading();
        fireEvent.error(document.querySelector(".pp-hero-main img")!);
        await waitFor(() => expect(document.querySelector(".pp-hero-main img")).toHaveAttribute("src", six[1].url));
        expect(document.querySelectorAll(".pp-hero-side")).toHaveLength(0);

        fireEvent.error(document.querySelector(".pp-hero-main img")!);
        await waitFor(() => expect(document.querySelector(".pp-hero.plain")).not.toBeNull());
        expect(screen.getByRole("heading", { level: 1, name: "Villa Mounir interiors" })).toBeInTheDocument();
    });
});

describe("3D and Drawings", () => {
    const drawings = [31, 32, 33, 34, 35].map((id) => itemOf(id, `Drawing ${id}`));
    const strip = () => within(screen.getByRole("list", { name: "Drawings: pictures and videos" }));

    it("show one row of pictures, as many as fit, with Show more for the rest; the other files apart", async () => {
        renderApp("/portal/projects/2", null, signedIn, served(withSection("drawing", [...drawings, plan])));
        await heading();

        // about a laptop's width: three cards to the row
        expect(strip().getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Drawing 31", "Drawing 32", "Drawing 33"]);
        const more = region("Drawings").getByRole("button", { name: "Show more (2)" });
        expect(more).toHaveAttribute("aria-expanded", "false");
        expect(more.querySelector(".ic")).not.toBeNull();
        // the plan isn't in the grid: it is a small card under it
        expect(within(screen.getByRole("list", { name: "Drawings: files" })).getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Ground floor plan"]);
        expect(region("Drawings").getByRole("heading", { name: "Files" })).toBeInTheDocument();

        await userEvent.click(more);
        expect(strip().getAllByRole("article")).toHaveLength(5);
        expect(region("Drawings").getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
        await userEvent.click(region("Drawings").getByRole("button", { name: "Show less" }));
        expect(strip().getAllByRole("article")).toHaveLength(3);

        // the lightbox moves through all of them, the ones out of sight too
        await userEvent.click(screen.getByRole("button", { name: "View Drawing 33" }));
        const dialog = await screen.findByRole("dialog", { name: "Drawing 33" });
        expect(within(dialog).getByText("3 of 5")).toBeInTheDocument();
    });

    it("keep a row that fits whole without Show more", async () => {
        renderApp("/portal/projects/2", null, signedIn, served(withSection("model", drawings.slice(0, 3))));
        await heading();
        expect(within(screen.getByRole("list", { name: "3D: pictures and videos" })).getAllByRole("article")).toHaveLength(3);
        expect(region("3D").queryByRole("button", { name: /^Show more/ })).toBeNull();
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
        expect(picker.closest(".pp-bar")).not.toBeNull();
        expect(within(picker).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Presentation", "3D", "Drawings"]);
        expect(within(picker).getByRole("tab", { name: "Presentation" })).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Living room", "Kitchen"]);
        // the introduction under the picture, not on it
        expect(document.querySelector(".pp-hero-over .pp-summary")).toBeNull();
        expect(screen.getByText("A calm, warm home for the family.")).toBeInTheDocument();

        await userEvent.click(within(picker).getByRole("tab", { name: "3D" }));
        expect(screen.queryAllByRole("article")).toEqual([]);
        expect(screen.getByText("Nothing here yet")).toBeInTheDocument();

        await userEvent.click(within(picker).getByRole("tab", { name: "Drawings" }));
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Ground floor plan", "Site model"]);
    });

    it("turns the pictures of 3D and Drawings into a slider, moved by its arrows or a swipe", async () => {
        const scrolled: unknown[] = [];
        vi.spyOn(Element.prototype, "scrollBy").mockImplementation((...args: unknown[]) => {
            scrolled.push(args[0]);
        });
        renderApp("/portal/projects/2", null, signedIn,
            served(withSection("drawing", [31, 32, 33, 34, 35].map((id) => itemOf(id, `Drawing ${id}`)))));
        await userEvent.click(within(await screen.findByRole("tablist", { name: "Sections" })).getByRole("tab", { name: "Drawings" }));

        const slides = screen.getByRole("list", { name: "Drawings: pictures and videos" });
        expect(slides).toHaveClass("pp-slides");
        // all of them, side by side: no Show more
        expect(within(slides).getAllByRole("article")).toHaveLength(5);
        expect(screen.queryByRole("button", { name: /^Show more/ })).toBeNull();
        // at the start: back has nowhere to go
        expect(screen.getByRole("button", { name: "Earlier pictures" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "More pictures" }));
        expect(scrolled).toHaveLength(1);
        expect(scrolled[0]).toMatchObject({ left: expect.any(Number) });
    });
});
