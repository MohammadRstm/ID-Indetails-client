import type { ReactNode } from "react";
import type { CommentThreadSummary } from "../discussion/discussionTypes";

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

/**
 * The discussion's part in the presentation: comments on files. Only the client's page gives it; without it nothing in
 * the presentation mentions comments (the staff's preview of the draft is such a page).
 */
export type PresentationComments = {
    /** Every file that has comments: a card shows its count and whether some are new. */
    threads: CommentThreadSummary[];
    /** The file whose comments are open (the page's ?item=), or null. */
    openItemId: number | null;
    /** Opens a file's comments, or closes them with null. */
    onOpen: (itemId: number | null) => void;
    /** A file's comments, as the lightbox's side panel shows them. */
    renderThread: (item: PresentationItem) => ReactNode;
};

/** What a card says of the comments on its file, and how to open them. */
export type CardComments = { count: number; unread: boolean; onOpen: () => void };

/** An image or a video the page can show itself. */
export type MediaItem = PresentationItem & { preview: "image" | "video"; previewUrl: string };

export function isMedia(item: PresentationItem): item is MediaItem {
    return (item.preview === "image" || item.preview === "video") && item.previewUrl != null;
}

/** The id of a section on the page, which the section menu scrolls to. */
export const sectionAnchor = (section: PortalSection) => `pp-${section}`;
