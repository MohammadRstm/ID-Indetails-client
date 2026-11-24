import { saveBlob } from "@/api/download";
import SkeletonBlock from "@/shared/components/Feedback/Skeleton";
import LoadError from "@/shared/components/Feedback/LoadError";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import Modal from "./Modal";

export type Attachment = { id: number; name: string; mimeType: string; kind?: string };

/**
 * An attached photo or video, full size, with a download (the prototype's UI.MediaLightbox). A profile or project photo
 * is only looked at, so it has no download. A document (a work entry's PDF, Word, Excel…) shows a PDF in place and
 * names anything else, with its download and a way to open it in a new tab.
 */
export default function MediaLightbox({ file, onClose, download: canDownload = true }: { file: Attachment; onClose: () => void; download?: boolean }) {
    const { url, isError } = useFileUrl(file.id);
    const video = file.kind === "video" || file.mimeType.startsWith("video/");
    const isDoc = file.kind === "document";
    const pdf = file.mimeType === "application/pdf";

    async function download() {
        if (!url) return;
        saveBlob(await (await fetch(url)).blob(), file.name);
    }

    return (
        <Modal size="xl" flush scrimClass="lightbox-scrim" onClose={onClose}
            foot={
                <>
                    {isDoc && <a className={url ? "btn" : "btn disabled"} href={url} target="_blank" rel="noreferrer"><Icon name="external" />Open in a new tab</a>}
                    {canDownload && <button className="btn" onClick={download} disabled={!url}><Icon name="download" />Download</button>}
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            <div className="lightbox-media">
                {isError ? <LoadError error={new Error("The file couldn't be loaded.")} what="the file" />
                    : !url ? <SkeletonBlock width={320} height={220} />
                        : isDoc && pdf ? <iframe className="lightbox-doc" src={url} title={file.name} />
                            : isDoc ? <div className="lightbox-file"><Icon name="file" /><b>{file.name}</b><span className="muted">Download it to open it.</span></div>
                                : video ? <video src={url} controls /> : <img src={url} alt={file.name} />}
            </div>
        </Modal>
    );
}
