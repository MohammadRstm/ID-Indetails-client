import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { P } from "@/app/permissions/codes";
import { projectWork } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import type { PortalChanges, PortalContent, PortalContentFile, PortalContentItem, PortalUsage } from "./contentApi";

/*
 * What the client portal's tests share: the API's shapes as small builders, and a mock of the content endpoint that a
 * test can change as the client's files change. The Project files tab's own builders are in filesTestKit.
 */

export const projectId = projectWork.project.id;
export const page = `/design/projects/${projectId}`;
/** The Client portal tab, opened on one of its parts. */
export const part = (name: string) => `${page}?tab=portal&part=${name}`;
export const base = "/api/projects/:id/portal/content";
export const MB = 1024 * 1024;
export const person = { id: 2, name: "Nadia Karam" };
/** The Design admin with client_portal:manage handed to her, as a super admin would: she chooses the client's files and publishes. */
export const publisher = withPermissions(personas.designAdmin, { grant: [P.CLIENT_PORTAL_MANAGE] });

export const fileOf = (id: number, name: string, over: Partial<PortalContentFile> = {}): PortalContentFile => ({
    id, name, contentType: "image/jpeg", preview: "image", originalBytes: 2 * MB, storedBytes: 2 * MB,
    uploadedAt: "2026-09-29T10:00:00Z", uploadedBy: person, ...over,
});

/** A file chosen for the client; unless a test says otherwise it is new, in Presentation, and can be the hero when it is a JPG, PNG or WebP image. */
export const itemOf = (id: number, title: string, file: PortalContentFile, over: Partial<PortalContentItem> = {}): PortalContentItem => {
    const shown = file.preview === "image" || file.preview === "video";
    const state = over.state ?? "new";
    return {
        id, section: "presentation", title, sortOrder: id, isDraft: state !== "unchanged", state, isHero: false,
        canBeHero: file.preview === "image" && /\.(jpe?g|png|webp)$/i.test(file.name), file,
        previewUrl: shown ? `/api/content-store/previews/${file.id}` : null,
        previewUrlExpiresAt: shown ? "2026-09-30T10:00:00Z" : null,
        createdAt: "2026-09-29T10:00:00Z", updatedAt: "2026-09-29T10:00:00Z", updatedBy: person, uploadedBy: file.uploadedBy, ...over,
    };
};

export const usageOf = (files: number, mb: number): PortalUsage => ({ files, originalBytes: mb * MB, storedBytes: mb * MB });

type ContentOver = Omit<Partial<PortalContent>, "changes"> & { changes?: Partial<PortalChanges> };

/**
 * The client's files as the API answers them, to someone who holds client_portal:manage unless a test says otherwise.
 * What publishing would change, and whether it can be published or discarded, follow from the items and the other
 * fields unless a test sets them.
 */
export const contentOf = (items: PortalContentItem[], over: ContentOver = {}): PortalContent => {
    const canManage = over.canManage ?? true;
    const canEdit = over.canEdit ?? canManage;
    const count = (state: PortalContentItem["state"]) => items.filter((i) => i.state === state).length;
    const changes: PortalChanges = {
        added: count("new"), updated: count("changed"), removed: count("removed"), reordered: [], heroChanged: false, summaryChanged: false,
        ...over.changes,
    };
    const unpublished = changes.added + changes.updated + changes.removed + changes.reordered.length > 0 || changes.heroChanged || changes.summaryChanged;
    return {
        projectId, storageReady: true, canManage, canEdit, readOnlyReason: null, usage: usageOf(items.length, items.length * 2),
        acceptedExtensions: ["jpg", "jpeg", "png", "pdf", "mp4"], items,
        revision: 7, publication: { publishedAt: null, publishedBy: null },
        hasUnpublishedChanges: unpublished, canPublish: canEdit && unpublished,
        canDiscard: canEdit && unpublished && over.publication?.publishedAt != null,
        hero: null, summary: null,
        ...over, changes,
    };
};

export const served = (content: PortalContent) => http.get(base, () => HttpResponse.json(content));
export const apiError = (status: number, code: string, message: string) => HttpResponse.json({ type: "error", code, message }, { status });

/** The content endpoint answering what `box.content` holds now, and counting how often it was asked: a test changes the content as the API would. */
export function liveContent(initial: PortalContent) {
    const box = { content: initial, gets: 0 };
    return { box, handler: http.get(base, () => { box.gets++; return HttpResponse.json(box.content); }) };
}

/** The titles of the section's cards, in the order they are shown. */
export const cards = () => screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
export const menuOf = async (title: string) => userEvent.click(await screen.findByRole("button", { name: `Actions for ${title}` }));
/** The card menu that is open: its items, apart from the buttons of the page (Preview is in both). */
export const inMenu = () => within(document.querySelector(".pop") as HTMLElement);
/** What the open card menu offers, in its order. */
export const menuItems = () => inMenu().getAllByRole("button").map((b) => b.textContent);
