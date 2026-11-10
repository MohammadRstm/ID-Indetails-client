import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { uploadFile } from "@/shared/files/upload";
import Icon from "@/shared/icons/Icon";
import { useSetProjectPhoto, type Project } from "./projectsApi";

/**
 * The project's tile at the top of its page: its own photo when it has one, its icon otherwise. Whoever edits projects
 * clicks it to choose a photo from their device, change it or take it off.
 */
export default function ProjectPhoto({ project, canEdit }: { project: Project; canEdit: boolean }) {
    const setPhoto = useSetProjectPhoto(project.id);
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const tile = <ProjectTile icon={project.icon} tint={project.tint} photo={project.photoFileId} size="lg" />;
    if (!canEdit) return tile;

    async function pick(file: File) {
        setUploading(true);
        try {
            const uploaded = await uploadFile(file, { maxEdge: 480 });
            await setPhoto.mutateAsync(uploaded.id);
            toast({ text: "Photo changed", sub: project.title, icon: "checkCircle" });
        } catch (e) {
            toast({ text: "The photo wasn't changed", sub: errorMessage(e), icon: "alert" });
        } finally {
            setUploading(false);
        }
    }

    function remove() {
        setPhoto.mutate(null, {
            onSuccess: () => toast({ text: "Photo taken off", sub: project.title, icon: "checkCircle" }),
            onError: (e) => toast({ text: "The photo wasn't taken off", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <>
            <MenuButton buttonClass="ptile-btn" align="left" width={200} label="Project photo" text={tile}>
                {(close) => (
                    <div>
                        <button className="pop-item" disabled={uploading || setPhoto.isPending} onClick={() => { close(); input.current?.click(); }}>
                            <Icon name="upload" />{uploading ? "Uploading…" : project.photoFileId ? "Change photo" : "Choose a photo"}
                        </button>
                        {project.photoFileId != null && (
                            <button className="pop-item" disabled={setPhoto.isPending} onClick={() => { close(); remove(); }}>
                                <Icon name="trash" />Take the photo off
                            </button>
                        )}
                    </div>
                )}
            </MenuButton>
            <input ref={input} type="file" accept="image/*" hidden aria-label="Project photo file"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void pick(file); }} />
        </>
    );
}
