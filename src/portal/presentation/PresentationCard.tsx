import { useState } from "react";
import { fmtBytes } from "@/shared/format/bytes";
import Icon from "@/shared/icons/Icon";
import { downloadItem, openItem } from "./presentationLinks";
import { isMedia, type GetLink, type MediaItem, type PresentationItem } from "./presentationTypes";

const extensionOf = (name: string) => (name.lastIndexOf(".") < 0 ? "" : name.slice(name.lastIndexOf(".") + 1).toUpperCase().slice(0, 5));

type Props = {
    item: PresentationItem;
    getLink: GetLink;
    /** An image or a video was chosen: the section's lightbox opens on it. */
    onView: (item: MediaItem) => void;
    /** A file that didn't load; its link may have expired. */
    onBroken: (url: string) => void;
};

/** One item of a section: an image or a video to look at, a PDF to open or save, or any other file to save. */
export default function PresentationCard({ item, getLink, onView, onBroken }: Props) {
    return (
        <article className="pp-card" aria-label={item.title}>
            {isMedia(item) ? <MediaCard item={item} onView={onView} onBroken={onBroken} /> : <FileCard item={item} getLink={getLink} />}
        </article>
    );
}

/** The tile of a file that has no picture: its type. */
function Tile({ item }: { item: PresentationItem }) {
    return (
        <span className="pp-tile">
            <Icon name="file" />
            <span className="pp-ext">{item.preview === "pdf" ? "PDF" : extensionOf(item.name) || "FILE"}</span>
        </span>
    );
}

function MediaCard({ item, onView, onBroken }: { item: MediaItem; onView: (item: MediaItem) => void; onBroken: (url: string) => void }) {
    // a link that fails stays a tile; the next answer brings a new link
    const [failed, setFailed] = useState<string | null>(null);
    const broken = failed === item.previewUrl;
    const fail = () => {
        setFailed(item.previewUrl);
        onBroken(item.previewUrl);
    };

    return (
        <>
            <button type="button" className="pp-thumb" aria-label={`View ${item.title}`} onClick={() => onView(item)}>
                {broken ? <Tile item={item} />
                    : item.preview === "video" ? <video preload="metadata" muted playsInline src={`${item.previewUrl}#t=0.1`} onError={fail} />
                        : <img loading="lazy" decoding="async" src={item.previewUrl} alt="" onError={fail} />}
                {item.preview === "video" && !broken && <span className="pp-play" aria-hidden="true"><Icon name="play" /></span>}
            </button>
            <div className="pp-body">
                <div className="pp-card-title">{item.title}</div>
            </div>
        </>
    );
}

function FileCard({ item, getLink }: { item: PresentationItem; getLink: GetLink }) {
    const [busy, setBusy] = useState(false);
    const isPdf = item.preview === "pdf";

    async function run(action: typeof openItem) {
        setBusy(true);
        try {
            await action(getLink, item);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="pp-thumb"><Tile item={item} /></div>
            <div className="pp-body">
                <div className="pp-card-title">{item.title}</div>
                <div className="pp-line">{item.name}</div>
                <div className="pp-line">{fmtBytes(item.sizeBytes)}</div>
                <div className="pp-actions">
                    {isPdf && (
                        <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Open ${item.title}`} onClick={() => void run(openItem)}>
                            <Icon name="external" />Open
                        </button>
                    )}
                    <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Download ${item.title}`} onClick={() => void run(downloadItem)}>
                        <Icon name="download" />Download
                    </button>
                </div>
            </div>
        </>
    );
}
