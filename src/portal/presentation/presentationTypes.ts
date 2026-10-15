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
    /** The first of the hero images (what the phone app shows), or null. */
    hero: PresentationHero | null;
    /** The hero images, in order: the first is the big one. */
    heroes: PresentationHero[];
    /** Always the three sections, in order, each with its items in display order. */
    sections: { section: PortalSection; items: PresentationItem[] }[];
};

/** A hero image: a signed link to it (about an hour; may be relative in development) and its file's name. */
export type PresentationHero = { url: string; urlExpiresAt: string; name: string };

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

/** What a file is to the page, by what the browser can show of it and its extension. */
export type FileKind = "image" | "video" | "document" | "other";

const IMAGES = ["jpg", "jpeg", "png", "webp", "gif"];
const VIDEOS = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
/** PDFs, and the office documents that go with them on the page. */
const DOCUMENTS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv"];

/** A file name's extension, lower case and without the dot ("" when it has none). */
export const extensionOf = (name: string) => (name.lastIndexOf(".") < 0 ? "" : name.slice(name.lastIndexOf(".") + 1).toLowerCase());

export function kindOf(item: PresentationItem): FileKind {
    const extension = extensionOf(item.name);
    if (item.preview === "image" || IMAGES.includes(extension)) return "image";
    if (item.preview === "video" || VIDEOS.includes(extension)) return "video";
    if (item.preview === "pdf" || DOCUMENTS.includes(extension)) return "document";
    return "other";
}

/** The run of pictures (and videos) the lightbox moves through: a section's grid, or the Presentation's Videos card. */
export type MediaRun = "grid" | "videos";

/** A section's items by where the page shows them, each kept in its order. */
export type SectionLayout = { grid: PresentationItem[]; videos: PresentationItem[]; documents: PresentationItem[]; others: PresentationItem[] };

/**
 * How a section lays out its items. Presentation: the pictures in a grid, and a card each for the videos, the PDFs and
 * documents, and any other files. 3D and Drawings: the pictures and videos the page can show in a grid, and every
 * other file in a list of its own.
 */
export function layoutOf(section: PortalSection, items: PresentationItem[]): SectionLayout {
    if (section === "presentation") {
        const of = (kind: FileKind) => items.filter((item) => kindOf(item) === kind);
        return { grid: of("image"), videos: of("video"), documents: of("document"), others: of("other") };
    }
    return { grid: items.filter(isMedia), videos: [], documents: [], others: items.filter((item) => !isMedia(item)) };
}

/** The pictures and videos the lightbox moves through, from the one opened. */
export function runOf(section: PortalSection, items: PresentationItem[], run: MediaRun): MediaItem[] {
    const layout = layoutOf(section, items);
    return (run === "videos" ? layout.videos : layout.grid).filter(isMedia);
}

/** Which run an item that the lightbox can show belongs to. */
export const runFor = (section: PortalSection, item: PresentationItem): MediaRun =>
    section === "presentation" && kindOf(item) === "video" ? "videos" : "grid";

/** The id of a section on the page, which the section menu scrolls to. */
export const sectionAnchor = (section: PortalSection) => `pp-${section}`;
