import { useRef, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "@/api/errors";
import { useDiscussionSummary } from "@/portal/discussion/discussionApi";
import { Badge } from "@/shared/components/Data/Pills";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { fmtBytes } from "@/shared/format/bytes";
import { relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { baseOf, type CardItem, type CardMode } from "./cards";
import { PORTAL_SECTIONS, SECTION_LABEL, type ItemState, type PortalSection } from "./contentApi";
import { downloadItem, openItemInTab } from "./contentLinks";
import ContentLightbox from "./ContentLightbox";
import { DeleteModal, RenameModal } from "./ContentModals";
import { useRestoreFile, useSetForClient, useUpdateFile } from "./filesApi";
import { staffDiscussion } from "./staffDiscussion";
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

/** What the tab lets its cards do; each card of Project files also says whether its own file may be changed. */
export type CardRights = {
    /** Project files, on a project that isn't archived. */
    canEdit: boolean;
    /** A new file can be sent for a card (not without file storage). */
    canReplace: boolean;
    /** Show to client and Hide from client (Project files), or Remove from client (Client portal). */
    canChoose: boolean;
};

type Props = CardRights & {
    projectId: number;
    mode: CardMode;
    item: CardItem;
    /** Given to a card that can be rearranged (Project files, for a manager; not a removed one, nor in an archived project). */
    sort?: CardSort;
    /** A preview that wouldn't load (its link may have expired): the files are loaded again. */
    onPreviewFailed: (fileId: number) => void;
    /** Asks for the new file of this card. */
    onReplace: (item: CardItem) => void;
    /** Project files: opens the card's comments. */
    onComments?: (itemId: number) => void;
};

/**
 * One file of a section: its preview, who put it there and when, and what can be done with it. In Project files it
 * says whether it goes to the client and how many comments it has; in the Client portal, where it stands against
 * what clients see.
 */
export default function ContentCard({ projectId, mode, item, canEdit: tabCanEdit, canReplace, canChoose, sort, onPreviewFailed, onReplace, onComments }: Props) {
    const { file } = item;
    const base = baseOf(mode, projectId);
    const move = useUpdateFile(projectId);
    const restore = useRestoreFile(projectId);
    const choose = useSetForClient(projectId);
    // the comments clients and the team wrote on this file in the Client portal's Discussion (for those who take part in it; the query is shared)
    const discussion = useDiscussionSummary(staffDiscussion, projectId, { enabled: mode === "portal", retry: false });
    const thread = mode !== "portal" || item.state === "new" ? undefined : discussion.data?.threads.find((t) => t.itemId === item.id);
    const [shown, setShown] = useState<"preview" | "rename" | "delete" | null>(null);
    // a link that fails is replaced once; if the new one fails too, the card shows the empty tile
    const [brokenFile, setBrokenFile] = useState<number | null>(null);
    const retried = useRef<number | null>(null);
    const broken = brokenFile === file.id;
    const ext = extensionOf(file.name).toUpperCase();
    const canPreview = file.preview !== "none";
    const { removed, comments } = item;
    // the tab allows changes, and this file is the person's to change
    const canEdit = tabCanEdit && item.canEdit;
    const showsName = item.title !== file.name && item.title !== stemOf(file.name);
    const showsImage = file.preview === "image" && item.previewUrl != null && !broken;
    const showsVideo = file.preview === "video" && item.previewUrl != null && !broken;

    function previewFailed() {
        if (retried.current === file.id) return setBrokenFile(file.id);
        retried.current = file.id;
        onPreviewFailed(file.id);
    }

    function preview() {
        if (file.preview === "pdf") void openItemInTab(base, item);
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

    async function setForClient(forClient: boolean) {
        try {
            await choose.mutateAsync({ itemId: item.id, forClient });
            toast(forClient
                ? { text: "Shown to the client", sub: `${item.title} · clients see it once it's published`, icon: "checkCircle" }
                : { text: "Hidden from the client", sub: `${item.title} · clients stop seeing it once that's published`, icon: "checkCircle" });
        } catch (error) {
            toast({ text: "The client's files weren't changed", sub: errorMessage(error), icon: "alert" });
        }
    }

    async function undo() {
        try {
            await restore.mutateAsync(item.id);
            toast({ text: "Deletion undone", sub: item.title, icon: "refresh" });
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
                                <button type="button" className="pop-item" onClick={() => { close(); void downloadItem(base, item); }}><Icon name="download" />Download</button>
                                {onComments && <button type="button" className="pop-item" onClick={() => { close(); onComments(item.id); }}><Icon name="chat" />Comments</button>}
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
                                    </>
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
                                {canChoose && !removed && (
                                    <>
                                        <div className="pop-sep" />
                                        {mode === "portal" ? (
                                            <button type="button" className="pop-item" onClick={() => { close(); void setForClient(false); }}><Icon name="x" />Remove from client</button>
                                        ) : item.forClient ? (
                                            <button type="button" className="pop-item" onClick={() => { close(); void setForClient(false); }}><Icon name="x" />Hide from client</button>
                                        ) : (
                                            <button type="button" className="pop-item" onClick={() => { close(); void setForClient(true); }}><Icon name="eye" />Show to client</button>
                                        )}
                                    </>
                                )}
                                {canEdit && !removed && (
                                    <>
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
                <div className="pc-line muted">Uploaded {item.uploadedBy ? `by ${item.uploadedBy.name} · ` : ""}{relDay(file.uploadedAt)}</div>
                <div className="pc-badges">
                    {item.state && <Badge className={STATE[item.state].className}>{STATE[item.state].label}</Badge>}
                    {mode === "portal" && item.isHero && <Badge icon="flag" className="badge-new">Hero</Badge>}
                    {mode === "files" && item.forClient && <Badge icon="eye" className="badge-active">For client</Badge>}
                    {comments && comments.total > 0 && (
                        <button type="button" className={cx("pc-comments", comments.open > 0 && "new")} onClick={() => onComments?.(item.id)}
                            aria-label={`Comments on ${item.title}: ${comments.total}${comments.open > 0 ? `, ${comments.open} open` : ""}`}>
                            <Icon name="chat" />{comments.total}{comments.open > 0 && <span className="pc-dot" aria-hidden="true" />}
                        </button>
                    )}
                    {thread && (
                        <Link className={cx("pc-comments", thread.unread > 0 && "new")} to={{ search: `?tab=portal&part=discussion&item=${item.id}` }}
                            aria-label={`Comments on ${item.title}: ${thread.count}${thread.unread > 0 ? ", some new" : ""}`}>
                            <Icon name="chat" />{thread.count}{thread.unread > 0 && <span className="pc-dot" aria-hidden="true" />}
                        </Link>
                    )}
                </div>
                {removed && (
                    <div className="pc-removed">
                        <span>{mode === "files" ? "Deleted — clients see it until the next publish" : "Removed — clients see it until you publish"}</span>
                        {canEdit && <button type="button" className="btn btn-sm" disabled={restore.isPending} onClick={() => void undo()}><Icon name="refresh" />Undo</button>}
                    </div>
                )}
            </div>

            {shown === "preview" && <ContentLightbox base={base} item={item} onClose={() => setShown(null)} />}
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
