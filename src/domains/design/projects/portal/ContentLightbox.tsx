import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import LoadError from "@/shared/components/Feedback/LoadError";
import SkeletonBlock from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { getContentLink, type FileItem } from "./contentApi";
import { downloadItem } from "./contentLinks";

/**
 * A photo or video of the project, full size, with a download. Like the chat's lightbox (MediaLightbox), which can't
 * be used here: it loads a file of the chat through the API, and these come from signed links. It starts with the
 * card's own link, and asks for a new one, once, at the tab's address (`base`), if that doesn't load.
 */
export default function ContentLightbox({ base, item, onClose }: { base: string; item: FileItem; onClose: () => void }) {
    const [stage, setStage] = useState<"card" | "new" | "failed">(item.previewUrl ? "card" : "new");
    const fresh = useQuery({
        queryKey: ["portal-content-link", base, item.id],
        queryFn: () => getContentLink(base, item.id, true),
        enabled: stage === "new",
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
    const url = stage === "card" ? item.previewUrl : stage === "new" ? fresh.data?.url : null;
    const video = item.file.preview === "video";
    const broken = () => setStage(stage === "card" ? "new" : "failed");

    return (
        <Modal size="xl" flush scrimClass="lightbox-scrim" title={item.title} onClose={onClose}
            foot={
                <>
                    <button className="btn" onClick={() => void downloadItem(base, item)}><Icon name="download" />Download</button>
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            <div className="lightbox-media">
                {stage === "failed" || fresh.isError ? <LoadError error={new Error("The file couldn't be loaded.")} what="the file" />
                    : !url ? <SkeletonBlock width={320} height={220} />
                        : video ? <video src={url} controls onError={broken} /> : <img src={url} alt={item.title} onError={broken} />}
            </div>
        </Modal>
    );
}
