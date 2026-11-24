import { useRef, useState } from "react";
import { fetchBlob } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { toast } from "@/shared/components/Feedback/toast";
import PhotoPositioner from "@/shared/components/Forms/PhotoPositioner";
import PhotoLightbox from "@/shared/components/Identity/PhotoLightbox";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { uploadFile } from "@/shared/files/upload";
import Icon from "@/shared/icons/Icon";
import { useSetProjectPhoto, type Project } from "./projectsApi";

/** A photo being placed in the tile's square: a new one from the device, or the project's own photo being moved. */
type Placing = { file: File; moving: boolean };

/**
 * The project's tile in its details: its own photo when it has one, its icon otherwise. Clicking the photo opens it
 * full screen. Whoever edits projects chooses a photo from their device, changes it, moves it in its square or takes it
 * off from the pencil on its corner. A photo is placed (dragged and zoomed) before it goes up, and is cut to the square
 * the tile shows.
 */
export default function ProjectPhoto({ project, canEdit }: { project: Project; canEdit: boolean }) {
    const setPhoto = useSetProjectPhoto(project.id);
    const input = useRef<HTMLInputElement>(null);
    const [placing, setPlacing] = useState<Placing | null>(null);
    const [opening, setOpening] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [viewing, setViewing] = useState(false);
    const tile = <ProjectTile icon={project.icon} tint={project.tint} photo={project.photoFileId} size="lg" />;
    const photo = project.photoFileId != null ? (
        <>
            <button type="button" className="ptile-btn" onClick={() => setViewing(true)} aria-label="See the project's photo full screen">{tile}</button>
            {viewing && <PhotoLightbox fileId={project.photoFileId} name={project.title} onClose={() => setViewing(false)} />}
        </>
    ) : tile;
    if (!canEdit) return photo;
    const busy = uploading || opening || setPhoto.isPending;

    async function save(file: File, moving: boolean) {
        setUploading(true);
        try {
            const uploaded = await uploadFile(file, { maxEdge: 480 });
            await setPhoto.mutateAsync(uploaded.id);
            toast({ text: moving ? "Photo moved" : "Photo changed", sub: project.title, icon: "checkCircle" });
        } catch (e) {
            toast({ text: moving ? "The photo wasn't moved" : "The photo wasn't changed", sub: errorMessage(e), icon: "alert" });
        } finally {
            setUploading(false);
        }
    }

    // the photo already on the project, opened again to place it differently
    async function moveCurrent() {
        if (project.photoFileId == null) return;
        setOpening(true);
        try {
            const { blob } = await fetchBlob(`/files/${project.photoFileId}`);
            setPlacing({ file: new File([blob], "project-photo", { type: blob.type }), moving: true });
        } catch (e) {
            toast({ text: "The photo couldn't be opened", sub: errorMessage(e), icon: "alert" });
        } finally {
            setOpening(false);
        }
    }

    function remove() {
        setPhoto.mutate(null, {
            onSuccess: () => toast({ text: "Photo taken off", sub: project.title, icon: "checkCircle" }),
            onError: (e) => toast({ text: "The photo wasn't taken off", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <span className="ptile-edit">
            {photo}
            <MenuButton buttonClass="ptile-corner" icon="edit" align="left" width={200} label="Change the project photo">
                {(close) => (
                    <div>
                        <button className="pop-item" disabled={busy} onClick={() => { close(); input.current?.click(); }}>
                            <Icon name="upload" />{uploading ? "Uploading…" : project.photoFileId ? "Change photo" : "Choose a photo"}
                        </button>
                        {project.photoFileId != null && (
                            <button className="pop-item" disabled={busy} onClick={() => { close(); void moveCurrent(); }}>
                                <Icon name="target" />{opening ? "Opening…" : "Move the photo"}
                            </button>
                        )}
                        {project.photoFileId != null && (
                            <button className="pop-item" disabled={busy} onClick={() => { close(); remove(); }}>
                                <Icon name="trash" />Take the photo off
                            </button>
                        )}
                    </div>
                )}
            </MenuButton>
            <input ref={input} type="file" accept="image/*" hidden aria-label="Project photo file"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setPlacing({ file, moving: false }); }} />
            {placing && (
                <PhotoPositioner
                    file={placing.file}
                    frame="square"
                    onCancel={() => setPlacing(null)}
                    onDone={(placed) => { setPlacing(null); void save(placed, placing.moving); }}
                />
            )}
        </span>
    );
}
