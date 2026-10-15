import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Badge } from "@/shared/components/Data/Pills";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { fmtBytes } from "@/shared/format/bytes";
import { relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { PORTAL_SECTIONS, SECTION_LABEL, useUpdateItem, type PortalContentItem, type PortalSection } from "./contentApi";
import { downloadItem, openItemInTab } from "./contentLinks";
import ContentLightbox from "./ContentLightbox";
import { DeleteModal, RenameModal } from "./ContentModals";

const extensionOf = (name: string) => (name.lastIndexOf(".") < 0 ? "" : name.slice(name.lastIndexOf(".") + 1));
const stemOf = (name: string) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

type Props = {
    projectId: number;
    item: PortalContentItem;
    /** False for an archived project: the card can be previewed and downloaded only. */
    canEdit: boolean;
    /** Whether a new file can be sent for it (not without file storage). */
    canReplace: boolean;
    /** A preview that wouldn't load (its link may have expired): the drafts are loaded again. */
    onPreviewFailed: (fileId: number) => void;
    /** Asks for the new file of this card. */
    onReplace: (item: PortalContentItem) => void;
};

/** One file of a section: its preview, who put it there and when, and what can be done with it. */
export default function ContentCard({ projectId, item, canEdit, canReplace, onPreviewFailed, onReplace }: Props) {
    const { file } = item;
    const move = useUpdateItem(projectId);
    const [shown, setShown] = useState<"preview" | "rename" | "delete" | null>(null);
    // a link that fails is replaced once; if the new one fails too, the card shows the empty tile
    const [brokenFile, setBrokenFile] = useState<number | null>(null);
    const retried = useRef<number | null>(null);
    const broken = brokenFile === file.id;
    const ext = extensionOf(file.name).toUpperCase();
    const canPreview = file.preview !== "none";
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

    const thumb = (
        <>
            {showsImage ? <img loading="lazy" decoding="async" src={item.previewUrl!} alt="" onError={previewFailed} />
                : showsVideo ? <video preload="metadata" muted playsInline src={`${item.previewUrl}#t=0.1`} onError={previewFailed} />
                    : <span className="pc-tile"><Icon name="file" /><span>{ext || "FILE"}</span></span>}
            {file.preview === "video" && showsVideo && <span className="pc-play"><Icon name="play" /></span>}
        </>
    );

    return (
        <article className="pc-card" aria-label={item.title}>
            {canPreview
                ? <button type="button" className="pc-thumb" aria-label={`Preview ${item.title}`} onClick={preview}>{thumb}</button>
                : <div className="pc-thumb">{thumb}</div>}
            <div className="pc-body">
                <div className="pc-head">
                    <div className="pc-title trunc" title={item.title}>{item.title}</div>
                    <MenuButton icon="dots" label={`Actions for ${item.title}`} width={190}>
                        {(close) => (
                            <div>
                                {canPreview && <button type="button" className="pop-item" onClick={() => { close(); preview(); }}><Icon name="eye" />Preview</button>}
                                <button type="button" className="pop-item" onClick={() => { close(); void downloadItem(projectId, item); }}><Icon name="download" />Download</button>
                                {canEdit && (
                                    <>
                                        <div className="pop-sep" />
                                        <button type="button" className="pop-item" onClick={() => { close(); setShown("rename"); }}><Icon name="edit" />Rename</button>
                                        {PORTAL_SECTIONS.filter((s) => s !== item.section).map((s) => (
                                            <button key={s} type="button" className="pop-item" onClick={() => { close(); void moveTo(s); }}>
                                                <Icon name="folder" />Move to {SECTION_LABEL[s]}
                                            </button>
                                        ))}
                                        {canReplace && <button type="button" className="pop-item" onClick={() => { close(); onReplace(item); }}><Icon name="upload" />Replace file</button>}
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
                <Badge className={item.isDraft ? undefined : "badge-active"}>{item.isDraft ? "Draft" : "Published"}</Badge>
            </div>

            {shown === "preview" && <ContentLightbox projectId={projectId} item={item} onClose={() => setShown(null)} />}
            {shown === "rename" && <RenameModal projectId={projectId} item={item} onClose={() => setShown(null)} />}
            {shown === "delete" && <DeleteModal projectId={projectId} item={item} onClose={() => setShown(null)} />}
        </article>
    );
}
