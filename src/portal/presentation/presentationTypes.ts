/*
 * What the client's project page and the staff preview of it both show: the API's presentation of a project.
 * These types are the portal's own, so the portal never imports staff code.
 */

/** The three places a project's files are sorted into, in the order the page shows them. */
export type PortalSection = "presentation" | "model" | "drawing";
/** What the browser can show of a file inline. */
export type PortalPreview = "image" | "video" | "pdf" | "none";

export const SECTIONS: PortalSection[] = ["presentation", "model", "drawing"];
export const SECTION_LABEL: Record<PortalSection, string> = { presentation: "Presentation", model: "3D", drawing: "Drawings" };

export type PresentationItem = {
    /** The item's id: what a link is asked for with. */
    id: number;
    title: string;
    /** The original file name. */
    name: string;
    contentType: string;
    preview: PortalPreview;
    sizeBytes: number;
    /** A signed link for an image or a video (about an hour); may be relative in development. */
    previewUrl: string | null;
    previewUrlExpiresAt: string | null;
};

export type PortalPresentation = {
    projectId: number;
    title: string;
    status: "active" | "hold" | "completed" | "archived";
    /** Plain text, paragraphs apart by a blank line. */
    summary: string | null;
    /** A client's page: whether anything was ever published. The staff preview: always true. */
    isPublished: boolean;
    publishedAt: string | null;
    hero: { url: string; urlExpiresAt: string; name: string } | null;
    /** Always the three sections, in order, each with its items in display order. */
    sections: { section: PortalSection; items: PresentationItem[] }[];
};

/** A short-lived link to a file: shown in the browser (`inline`) or saved. */
export type GetLink = (itemId: number, inline: boolean) => Promise<{ url: string }>;

/** An image or a video the page can show itself. */
export type MediaItem = PresentationItem & { preview: "image" | "video"; previewUrl: string };

export function isMedia(item: PresentationItem): item is MediaItem {
    return (item.preview === "image" || item.preview === "video") && item.previewUrl != null;
}

/** The id of a section on the page, which the section menu scrolls to. */
export const sectionAnchor = (section: PortalSection) => `pp-${section}`;
