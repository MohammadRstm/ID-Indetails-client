import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Badge } from "@/shared/components/Data/Pills";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { fmtBytes } from "@/shared/format/bytes";
import { relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { PORTAL_SECTIONS, SECTION_LABEL, useRestoreItem, useSetHero, useUpdateItem, type ItemState, type PortalContentItem, type PortalSection } from "./contentApi";
import { downloadItem, openItemInTab } from "./contentLinks";
import ContentLightbox from "./ContentLightbox";
import { DeleteModal, RenameModal } from "./ContentModals";
import type { GripProps, Held, MoveTo } from "./useCardSort";

const extensionOf = (name: string) => (name.lastIndexOf(".") < 0 ? "" : name.slice(name.lastIndexOf(".") + 1));
const stemOf = (name: string) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

/** How a card says where it stands against what clients see. Published and unchanged is the quiet one. */
const STATE: Record<ItemState, { label: string; className?: string }> = {
    new: { label: "New", className: "badge-new" },
    changed: { label: "Changed", className: "badge-hold" },
    removed: { label: "Removed", className: "badge-removed" },
    unchanged: { label: "Published" },
};

/** What a card can do to take its place among the others: it is rearranged by its handle or by its menu. */
export type CardSort = {
    index: number;
    count: number;
    /** How the card has been picked up, if it has. */
    held: Held["by"] | null;
    grip: GripProps;
    move: (to: MoveTo) => void;
};

type Props = {
    projectId: number;
    item: PortalContentItem;
    /** False for an archived project: the card can be previewed and downloaded only. */
    canEdit: boolean;
    /** Whether a new file can be sent for it (not without file storage). */
    canReplace: boolean;
    /** Given to a card that can be rearranged (not a removed one, nor in an archived project). */
    sort?: CardSort;
    /** A preview that wouldn't load (its link may have expired): the drafts are loaded again. */
    onPreviewFailed: (fileId: number) => void;
    /** Asks for the new file of this card. */
    onReplace: (item: PortalContentItem) => void;
};

/** One file of a section: its preview, who put it there and when, and what can be done with it. */
export default function ContentCard({ projectId, item, canEdit, canReplace, sort, onPreviewFailed, onReplace }: Props) {
    const { file } = item;
    const move = useUpdateItem(projectId);
    const setHero = useSetHero(projectId);
    const restore = useRestoreItem(projectId);
    const [shown, setShown] = useState<"preview" | "rename" | "delete" | null>(null);
    // a link that fails is replaced once; if the new one fails too, the card shows the empty tile
    const [brokenFile, setBrokenFile] = useState<number | null>(null);
    const retried = useRef<number | null>(null);
    const broken = brokenFile === file.id;
    const ext = extensionOf(file.name).toUpperCase();
    const canPreview = file.preview !== "none";
    const removed = item.state === "removed";
    const showsName = item.title !== file.name && item.title !== stemOf(file.name);
    const showsImage = file.preview === "image" && item.previewUrl != null && !broken;
    const showsVideo = file.preview === "video" && item.previewUrl != null && !broken;

    function previewFailed() {
        if (retried.current === file.id) return setBrokenFile(file.id);
        retried.current = file.id;
        onPreviewFailed(file.id);
    }

    function preview() {
        if (file.preview === "pdf") void openItemInTab(projectId, item);
        else setShown("preview");
    }

    async function moveTo(section: PortalSection) {
        try {
            await move.mutateAsync({ itemId: item.id, section });
            toast({ text: `Moved to ${SECTION_LABEL[section]}`, sub: item.title, icon: "checkCircle" });
        } catch (error) {
            toast({ text: "The file wasn't moved", sub: errorMessage(error), icon: "alert" });
        }
    }

    async function chooseAsHero() {
        try {
            await setHero.mutateAsync(item.id);
            toast({ text: "Hero image set", sub: item.title, icon: "checkCircle" });
        } catch (error) {
            toast({ text: "The hero image wasn't changed", sub: errorMessage(error), icon: "alert" });
        }
    }

    async function undo() {
        try {
            await restore.mutateAsync(item.id);
            toast({ text: "Removal undone", sub: item.title, icon: "refresh" });
        } catch (error) {
            toast({ text: "The file wasn't restored", sub: errorMessage(error), icon: "alert" });
        }
    }

    const thumb = (
        <>
            {showsImage ? <img loading="lazy" decoding="async" src={item.previewUrl!} alt="" onError={previewFailed} />
                : showsVideo ? <video preload="metadata" muted playsInline src={`${item.previewUrl}#t=0.1`} onError={previewFailed} />
                    : <span className="pc-tile"><Icon name="file" /><span>{ext || "FILE"}</span></span>}
            {file.preview === "video" && showsVideo && <span className="pc-play"><Icon name="play" /></span>}
        </>
    );

    return (
        <article className={cx("pc-card", removed && "removed", sort?.held === "pointer" && "placeholder", sort?.held === "keys" && "lifted")}
            aria-label={item.title} data-card={sort ? item.id : undefined}>
            {sort && (
                <button type="button" className="pc-grip" aria-label={`Reorder ${item.title}`} {...sort.grip}><Grip /></button>
            )}
            {canPreview
                ? <button type="button" className="pc-thumb" aria-label={`Preview ${item.title}`} onClick={preview}>{thumb}</button>
                : <div className="pc-thumb">{thumb}</div>}
            <div className="pc-body">
                <div className="pc-head">
                    <div className="pc-title trunc" title={item.title}>{item.title}</div>
                    <MenuButton icon="dots" label={`Actions for ${item.title}`} width={190}>
                        {(close) => (
                            <div>
                                {canPreview && !removed && <button type="button" className="pop-item" onClick={() => { close(); preview(); }}><Icon name="eye" />Preview</button>}
                                <button type="button" className="pop-item" onClick={() => { close(); void downloadItem(projectId, item); }}><Icon name="download" />Download</button>
                                {canEdit && !removed && (
                                    <>
                                        <div className="pop-sep" />
                                        <button type="button" className="pop-item" onClick={() => { close(); setShown("rename"); }}><Icon name="edit" />Rename</button>
                                        {PORTAL_SECTIONS.filter((s) => s !== item.section).map((s) => (
                                            <button key={s} type="button" className="pop-item" onClick={() => { close(); void moveTo(s); }}>
                                                <Icon name="folder" />Move to {SECTION_LABEL[s]}
                                            </button>
                                        ))}
                                        {canReplace && <button type="button" className="pop-item" onClick={() => { close(); onReplace(item); }}><Icon name="upload" />Replace file</button>}
                                        {item.canBeHero && !item.isHero && (
                                            <button type="button" className="pop-item" onClick={() => { close(); void chooseAsHero(); }}><Icon name="flag" />Use as hero image</button>
                                        )}
                                        {sort && (
                                            <>
                                                <div className="pop-sep" />
                                                {sort.index > 0 && <button type="button" className="pop-item" onClick={() => { close(); sort.move("earlier"); }}><Icon name="chevronLeft" />Move earlier</button>}
                                                {sort.index < sort.count - 1 && <button type="button" className="pop-item" onClick={() => { close(); sort.move("later"); }}><Icon name="chevronRight" />Move later</button>}
                                                {sort.index > 0 && <button type="button" className="pop-item" onClick={() => { close(); sort.move("start"); }}><Icon name="arrowUp" />Move to start</button>}
                                                {sort.index < sort.count - 1 && <button type="button" className="pop-item" onClick={() => { close(); sort.move("end"); }}><Icon name="arrowDown" />Move to end</button>}
                                            </>
                                        )}
                                        <div className="pop-sep" />
                                        <button type="button" className="pop-item danger" onClick={() => { close(); setShown("delete"); }}><Icon name="trash" />Delete</button>
                                    </>
                                )}
                            </div>
                        )}
                    </MenuButton>
                </div>
                {showsName && <div className="pc-line muted trunc" title={file.name}>{file.name}</div>}
                <div className="pc-line muted">{ext || file.contentType} · {fmtBytes(file.originalBytes)}</div>
                <div className="pc-line muted">Uploaded {file.uploadedBy ? `by ${file.uploadedBy.name} · ` : ""}{relDay(file.uploadedAt)}</div>
                <div className="pc-badges">
                    <Badge className={STATE[item.state].className}>{STATE[item.state].label}</Badge>
                    {item.isHero && <Badge icon="flag" className="badge-new">Hero</Badge>}
                </div>
                {removed && (
                    <div className="pc-removed">
                        <span>Removed — clients see it until you publish</span>
                        {canEdit && <button type="button" className="btn btn-sm" disabled={restore.isPending} onClick={() => void undo()}><Icon name="refresh" />Undo</button>}
                    </div>
                )}
            </div>

            {shown === "preview" && <ContentLightbox projectId={projectId} item={item} onClose={() => setShown(null)} />}
            {shown === "rename" && <RenameModal projectId={projectId} item={item} onClose={() => setShown(null)} />}
            {shown === "delete" && <DeleteModal projectId={projectId} item={item} onClose={() => setShown(null)} />}
        </article>
    );
}

/** Six dots: the handle a card is picked up by. */
function Grip() {
    return (
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            {[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} className="f" cx={x} cy={y} r="1.5" />))}
        </svg>
    );
}
