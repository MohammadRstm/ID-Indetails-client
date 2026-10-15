import { useState } from "react";
import Popover from "@/shared/components/Overlays/Popover";
import { fmtBytes } from "@/shared/format/bytes";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
import { cx } from "@/shared/utils/cx";
import { CommentsChip } from "./PresentationCard";
import { downloadItem, openItem } from "./presentationLinks";
import { extensionOf, isMedia, kindOf, type CardComments, type GetLink, type MediaItem, type PresentationItem } from "./presentationTypes";

/*
 * The files of a presentation that aren't pictures in its grid: small cards with their type's icon (a PDF's is red),
 * and in Presentation a card for each kind of them that lists its files.
 */

/** A file's icon: a red PDF, a video, or any other type with its extension. */
function iconOf(item: PresentationItem): { icon: IconName; tone: "pdf" | "video" | "other" } {
    if (kindOf(item) === "video") return { icon: "video", tone: "video" };
    if (item.preview === "pdf" || extensionOf(item.name) === "pdf") return { icon: "pdf", tone: "pdf" };
    return { icon: "fileType", tone: "other" };
}

type RowProps = {
    item: PresentationItem;
    getLink: GetLink;
    /** A video the page can play: Play opens it in the lightbox. */
    onPlay?: (item: MediaItem) => void;
    /** Given on the client's page only: the comments on this file. */
    comments?: CardComments;
};

/** One file as a small card: its type's icon, its title, name and size, and Play (a video), Open (a PDF), Download and its comments. */
export function FileRow({ item, getLink, onPlay, comments }: RowProps) {
    const [busy, setBusy] = useState(false);
    const { icon, tone } = iconOf(item);
    const extension = extensionOf(item.name).toUpperCase().slice(0, 5);

    async function run(action: typeof openItem) {
        setBusy(true);
        try {
            await action(getLink, item);
        } finally {
            setBusy(false);
        }
    }

    return (
        <article className="pp-file" aria-label={item.title}>
            <span className={cx("pp-file-icon", tone)}>
                <Icon name={icon} />
                {tone === "other" && extension && <span className="pp-file-ext">{extension}</span>}
            </span>
            <div className="pp-file-main">
                <div className="pp-file-title">{item.title}</div>
                <div className="pp-line"><span>{item.name}</span> · <span>{fmtBytes(item.sizeBytes)}</span></div>
                <div className="pp-file-actions">
                    {onPlay && isMedia(item) && (
                        <button type="button" className="btn btn-sm" aria-label={`Play ${item.title}`} onClick={() => onPlay(item)}>
                            <Icon name="play" />Play
                        </button>
                    )}
                    {item.preview === "pdf" && (
                        <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Open ${item.title}`} onClick={() => void run(openItem)}>
                            <Icon name="external" />Open
                        </button>
                    )}
                    <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Download ${item.title}`} onClick={() => void run(downloadItem)}>
                        <Icon name="download" />Download
                    </button>
                    {comments && <CommentsChip item={item} comments={comments} />}
                </div>
            </div>
        </article>
    );
}

/** The kinds of file Presentation has a card for, besides its pictures. */
export type GroupKind = "document" | "video" | "other";

const GROUPS: Record<GroupKind, { label: string; icon: IconName }> = {
    document: { label: "PDFs and documents", icon: "pdf" },
    video: { label: "Videos", icon: "video" },
    other: { label: "Other files", icon: "fileType" },
};

type GroupProps = {
    kind: GroupKind;
    /** Its files, in their order. */
    items: PresentationItem[];
    getLink: GetLink;
    /** A video to play: the lightbox opens on it. */
    onPlay: (item: MediaItem) => void;
    /** A file's comments (the client's page only); `close` closes the list first, as its comments open over the page. */
    commentsOf?: (item: PresentationItem, close: () => void) => CardComments | undefined;
};

/**
 * A wide, compact card for one kind of file in Presentation: its icon, what it is and how many. With one file a click
 * opens it at once (a video plays in the lightbox, a document shows Open and Download); with several, a small list to
 * pick from.
 */
export function FileGroupCard({ kind, items, getLink, onPlay, commentsOf }: GroupProps) {
    const { label, icon } = GROUPS[kind];
    const only = items.length === 1 ? items[0] : null;
    const face = (end: IconName) => (
        <>
            <span className={cx("pp-kind-icon", kind)}><Icon name={icon} /></span>
            {/* (the space keeps the two apart when the card's name is read out) */}
            <span className="pp-kind-text">
                <span className="pp-kind-label">{label}</span>{" "}
                <span className="pp-kind-count">{only ? only.title : plural(items.length, "file")}</span>
            </span>
            <Icon name={end} className="pp-kind-end" />
        </>
    );

    // one video the page can play: straight to it
    if (only && isMedia(only)) {
        return <button type="button" className="pp-kind" onClick={() => onPlay(only)}>{face("play")}</button>;
    }

    return (
        <Popover align="right" width={340} hostClass="pp-kind-host" className="pp-kind-pop"
            trigger={(open, toggle) => (
                <button type="button" className={cx("pp-kind", open && "on")} aria-expanded={open} onClick={toggle}>{face("chevronDown")}</button>
            )}>
            {(close) => (
                <div role="group" aria-label={label}>
                    <ul className="pp-kind-list">
                        {items.map((item) => (
                            <li key={item.id}>
                                <FileRow item={item} getLink={getLink} comments={commentsOf?.(item, close)}
                                    onPlay={(video) => {
                                        close();
                                        onPlay(video);
                                    }} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Popover>
    );
}
