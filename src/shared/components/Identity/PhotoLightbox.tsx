import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";

/**
 * Someone's profile photo, or a project's, full screen. Clicks inside it stay inside it: it can open from a clickable row
 * (a chat in the list, a notification), and the row mustn't open too.
 */
export default function PhotoLightbox({ fileId, name, onClose }: { fileId: number; name: string; onClose: () => void }) {
    return (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <MediaLightbox file={{ id: fileId, name, mimeType: "image/jpeg", kind: "image" }} download={false} onClose={onClose} />
        </span>
    );
}
