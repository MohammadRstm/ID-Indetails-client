import Modal from "@/shared/components/Overlays/Modal";
import { fmtBytes } from "@/shared/format/bytes";
import Icon from "@/shared/icons/Icon";
import { baseOf } from "./cards";
import ContentLightbox from "./ContentLightbox";
import { downloadItem, openItemInTab } from "./contentLinks";
import type { ProjectFile } from "./filesApi";

/**
 * A project file opened from its link (?view={itemId}, as Proton opens one): a photo or a video in the lightbox, as
 * its card's Preview shows it; anything else in a small window whose Open and Download the person presses themselves,
 * since a browser opens a new tab only on the person's own click.
 */
export default function FileView({ projectId, item, onClose }: { projectId: number; item: ProjectFile; onClose: () => void }) {
    const base = baseOf("files", projectId);
    if (item.file.preview === "image" || item.file.preview === "video") {
        return <ContentLightbox base={base} item={item} onClose={onClose} />;
    }

    return (
        <Modal surfaceId="view_project_file" title={item.title} sub={`${item.file.name} · ${fmtBytes(item.file.originalBytes)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow" />
                    <button className="btn" onClick={() => void downloadItem(base, item)}><Icon name="download" />Download</button>
                    {item.file.preview === "pdf" && (
                        <button className="btn btn-primary" onClick={() => void openItemInTab(base, item)}><Icon name="eye" />Open</button>
                    )}
                </>
            }>
            <p className="muted">
                {item.file.preview === "pdf" ? "The PDF opens in a new tab." : "This kind of file can't be shown here: download it to open it."}
            </p>
        </Modal>
    );
}
