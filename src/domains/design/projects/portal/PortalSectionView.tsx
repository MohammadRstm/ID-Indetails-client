import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { loadFailed } from "@/api/queryState";
import Panel from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { fmtBytes } from "@/shared/format/bytes";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../../shared/projects/projectsApi";
import { byOrder, forgetPreview, SECTION_LABEL, usePortalContent, type PortalContentItem, type PortalSection } from "./contentApi";
import ContentCard from "./ContentCard";
import UploadQueue from "./UploadQueue";
import { useUploads } from "./useUploads";

const COPY: Record<PortalSection, { sub: string; emptyTitle: string; empty: string }> = {
    presentation: {
        sub: "Images, videos and documents that present the design.",
        emptyTitle: "No presentation files yet",
        empty: "Upload mood boards, concept images or presentation decks.",
    },
    model: {
        sub: "Renders, walkthrough videos and model files.",
        emptyTitle: "No 3D files yet",
        empty: "Upload renders, walkthrough videos or model files.",
    },
    drawing: {
        sub: "Plans, elevations and other drawings.",
        emptyTitle: "No drawings yet",
        empty: "Upload plans, elevations or other drawings.",
    },
};

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * One section of a project's client portal drafts (client_portal:manage): what is stored, the files on their way
 * up, and a card for each file. Files come from the Upload files button or are dropped on the section; every
 * file stays a draft, which the client can't see.
 */
export default function PortalSectionView({ project, section }: { project: Project; section: PortalSection }) {
    const content = usePortalContent(project.id);
    const uploads = useUploads(project.id);
    const chooser = useRef<HTMLInputElement>(null);
    const replacer = useRef<HTMLInputElement>(null);
    const replacing = useRef<number | null>(null);
    // dragging over a child fires enter and leave on the way: the section counts how deep the pointer is
    const depth = useRef(0);
    const [dropping, setDropping] = useState(false);
    const label = SECTION_LABEL[section];

    if (loadFailed(content)) {
        return <Panel title={label}><LoadError error={content.error} retry={() => content.refetch()} what="the client portal files" /></Panel>;
    }
    if (!content.data) return <Panel title={label}><Loading /></Panel>;

    const { storageReady, canEdit, readOnlyReason, usage, acceptedExtensions } = content.data;
    const items = content.data.items.filter((item) => item.section === section).sort(byOrder);
    const canUpload = storageReady && canEdit;
    const accept = acceptedExtensions.map((e) => `.${e}`).join(",");

    function add(files: File[], replaceItemId?: number) {
        if (files.length > 0) uploads.add(section, files, acceptedExtensions, replaceItemId);
    }

    function chosen(e: ChangeEvent<HTMLInputElement>) {
        add(Array.from(e.target.files ?? []));
        // the same file can be chosen again
        e.target.value = "";
    }

    function replacementChosen(e: ChangeEvent<HTMLInputElement>) {
        const [file] = Array.from(e.target.files ?? []);
        if (file && replacing.current != null) add([file], replacing.current);
        replacing.current = null;
        e.target.value = "";
    }

    function askForReplacement(item: PortalContentItem) {
        replacing.current = item.id;
        replacer.current?.click();
    }

    function previewFailed(fileId: number) {
        forgetPreview(fileId);
        void content.refetch({ cancelRefetch: false });
    }

    // Files dropped on the section go to it. Over a section that can't take them, a drop still must not open the
    // file in place of the page.
    function dragEnter(e: DragEvent) {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        depth.current++;
        if (canUpload) setDropping(true);
    }
    function dragOver(e: DragEvent) {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = canUpload ? "copy" : "none";
    }
    function dragLeave(e: DragEvent) {
        if (!carriesFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDropping(false);
    }
    function drop(e: DragEvent) {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length === 0) return;
        e.preventDefault();
        depth.current = 0;
        setDropping(false);
        if (canUpload) add(files);
    }

    return (
        <div className={cx("pc-drop", dropping && "on")} onDragEnter={dragEnter} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
            {dropping && <div className="pc-drop-cue" aria-hidden="true">Drop to upload to {label}</div>}
            <Panel title={label} sub={`${COPY[section].sub} Everything here is a draft the client can't see.`}
                tools={canUpload && (
                    <>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => chooser.current?.click()}><Icon name="upload" />Upload files</button>
                        <input ref={chooser} type="file" multiple hidden accept={accept} aria-label="Files to upload" onChange={chosen} />
                        <input ref={replacer} type="file" hidden accept={accept} aria-label="New file for the card" onChange={replacementChosen} />
                    </>
                )}>
                <div className="pc-strip">
                    <span>{`${plural(usage.files, "file")} · ${fmtBytes(usage.originalBytes)} original · ${fmtBytes(usage.storedBytes)} stored`}</span>
                    <span className="hint">Stored size is what the file storage reports; no compression is applied.</span>
                </div>
                {!storageReady && (
                    <div className="banner hold pc-note">
                        <Icon name="info" />
                        <div className="grow">File storage for the client portal isn't set up yet. Ask your administrator.</div>
                    </div>
                )}
                {!canEdit && (
                    <div className="banner pc-note">
                        <Icon name="lock" />
                        <div className="grow">{readOnlyReason ?? "The files of this project can't be changed."}</div>
                    </div>
                )}
                <UploadQueue rows={uploads.rows} onCancel={uploads.cancel} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
                {items.length === 0 ? (
                    <Empty art="projects" title={COPY[section].emptyTitle} text={canUpload ? `${COPY[section].empty} Drag files here or use Upload files.` : undefined} />
                ) : (
                    <div className="pc-grid">
                        {items.map((item) => (
                            <ContentCard key={item.id} projectId={project.id} item={item} canEdit={canEdit} canReplace={canUpload} onPreviewFailed={previewFailed} onReplace={askForReplacement} />
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
}

function Loading() {
    return (
        <div className="pc-grid" aria-busy="true" aria-label="Loading">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pc-card">
                    <Skeleton height={140} style={{ borderRadius: 0 }} />
                    <div className="pc-body"><Skeleton width="70%" height={13} /><Skeleton width="45%" style={{ marginTop: 6 }} /></div>
                </div>
            ))}
        </div>
    );
}
