import { saveBlob } from "@/api/download";
import SkeletonBlock from "@/shared/components/Feedback/Skeleton";
import LoadError from "@/shared/components/Feedback/LoadError";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import Modal from "./Modal";

export type Attachment = { id: number; name: string; mimeType: string; kind?: string };

/**
 * An attached photo or video, full size, with a download (the prototype's UI.MediaLightbox). A profile or project photo
 * is only looked at, so it has no download.
 */
export default function MediaLightbox({ file, onClose, download: canDownload = true }: { file: Attachment; onClose: () => void; download?: boolean }) {
    const { url, isError } = useFileUrl(file.id);
    const video = file.kind === "video" || file.mimeType.startsWith("video/");

    async function download() {
        if (!url) return;
        saveBlob(await (await fetch(url)).blob(), file.name);
    }

    return (
        <Modal size="xl" flush scrimClass="lightbox-scrim" onClose={onClose}
            foot={
                <>
                    {canDownload && <button className="btn" onClick={download} disabled={!url}><Icon name="download" />Download</button>}
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            <div className="lightbox-media">
                {isError ? <LoadError error={new Error("The file couldn't be loaded.")} what="the file" />
                    : !url ? <SkeletonBlock width={320} height={220} />
                        : video ? <video src={url} controls /> : <img src={url} alt={file.name} />}
            </div>
        </Modal>
    );
}
