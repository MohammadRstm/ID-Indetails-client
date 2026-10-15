import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router";
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
import CardGrid from "./CardGrid";
import { chosenCard, fileCard, type CardItem, type CardMode } from "./cards";
import { byOrder, forgetPreview, SECTION_LABEL, usePortalContent, type PortalContent, type PortalSection, type PortalUsage } from "./contentApi";
import { useProjectFiles, type ProjectFiles } from "./filesApi";
import PresentationIntro from "./PresentationIntro";
import UploadQueue from "./UploadQueue";
import { useUploads } from "./useUploads";

const COPY: Record<PortalSection, { sub: string; emptyTitle: string; empty: string; noneChosen: string }> = {
    presentation: {
        sub: "Images, videos and documents that present the design.",
        emptyTitle: "No presentation files yet",
        empty: "Upload mood boards, concept images or presentation decks.",
        noneChosen: "No presentation files for the client yet",
    },
    model: {
        sub: "Renders, walkthrough videos and model files.",
        emptyTitle: "No 3D files yet",
        empty: "Upload renders, walkthrough videos or model files.",
        noneChosen: "No 3D files for the client yet",
    },
    drawing: {
        sub: "Plans, elevations and other drawings.",
        emptyTitle: "No drawings yet",
        empty: "Upload plans, elevations or other drawings.",
        noneChosen: "No drawings for the client yet",
    },
};

const LOCKED = "The files of this project can't be changed.";

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** What a section shows, from either tab's answer. */
type SectionData = {
    storageReady: boolean;
    usage: PortalUsage;
    acceptedExtensions: string[];
    items: CardItem[];
    /** Why nothing can be changed, when the person would otherwise change something. */
    locked: string | null;
    /** Files can be uploaded and the cards changed (Project files, not archived). */
    canEdit: boolean;
    /** The cards can be rearranged (Project files, for a manager). */
    canSort: boolean;
    /** Show to client and Hide from client (Project files), or Remove from client (Client portal). */
    canChoose: boolean;
};

const ofFiles = (files: ProjectFiles): SectionData => ({
    storageReady: files.storageReady, usage: files.usage, acceptedExtensions: files.acceptedExtensions, items: files.items.map(fileCard),
    locked: files.canEdit ? null : files.readOnlyReason ?? LOCKED,
    canEdit: files.canEdit, canSort: files.canEdit && files.canManage, canChoose: files.canChooseForClient,
});

const ofContent = (content: PortalContent): SectionData => ({
    storageReady: content.storageReady, usage: content.usage, acceptedExtensions: content.acceptedExtensions, items: content.items.map(chosenCard),
    // only someone who chooses the client's files is told they can't now
    locked: content.canManage && !content.canEdit ? content.readOnlyReason ?? LOCKED : null,
    canEdit: false, canSort: false, canChoose: content.canEdit,
});

/** The tab's own answer: all the project's files, or the client's. */
function useSection(mode: CardMode, projectId: number) {
    const files = useProjectFiles(projectId, mode === "files");
    const content = usePortalContent(projectId, mode === "portal");
    return mode === "files"
        ? { query: files, data: files.data && ofFiles(files.data), content: undefined }
        : { query: content, data: content.data && ofContent(content.data), content: content.data };
}

type Props = {
    project: Project;
    section: PortalSection;
    mode: CardMode;
    /** Project files: opens a card's comments. */
    onComments?: (itemId: number) => void;
};

/**
 * One section of a project's files. In Project files: what is stored, the files on their way up, and a card for each
 * file; files come from the Upload files button or are dropped on the section. In the Client portal: only the files
 * chosen for the client, as read-only cards, with the hero image and the introduction at the top of Presentation.
 */
export default function PortalSectionView({ project, section, mode, onComments }: Props) {
    const { query, data, content } = useSection(mode, project.id);
    const uploads = useUploads(project.id);
    const chooser = useRef<HTMLInputElement>(null);
    const replacer = useRef<HTMLInputElement>(null);
    const replacing = useRef<number | null>(null);
    // dragging over a child fires enter and leave on the way: the section counts how deep the pointer is
    const depth = useRef(0);
    const [dropping, setDropping] = useState(false);
    const label = SECTION_LABEL[section];
    const files = mode === "files";

    if (loadFailed(query)) {
        return <Panel title={label}><LoadError error={query.error} retry={() => query.refetch()} what={files ? "the project's files" : "the client portal files"} /></Panel>;
    }
    if (!data) return <Panel title={label}><Loading /></Panel>;

    const { storageReady, usage, acceptedExtensions, locked } = data;
    const items = data.items.filter((item) => item.section === section).sort(byOrder);
    const canUpload = files && storageReady && data.canEdit;
    const accept = acceptedExtensions.map((e) => `.${e}`).join(",");
    // the client portal's own uploads are its hero images
    const rows = files ? uploads.rows : uploads.rows.filter((row) => row.section === "hero");

    function add(list: File[], replaceItemId?: number) {
        if (list.length > 0) uploads.add(section, list, acceptedExtensions, replaceItemId);
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

    function askForReplacement(item: CardItem) {
        replacing.current = item.id;
        replacer.current?.click();
    }

    function previewFailed(fileId: number) {
        forgetPreview(fileId);
        void query.refetch({ cancelRefetch: false });
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
        const list = Array.from(e.dataTransfer?.files ?? []);
        if (list.length === 0) return;
        e.preventDefault();
        depth.current = 0;
        setDropping(false);
        if (canUpload) add(list);
    }

    return (
        <>
            {content && section === "presentation" && <PresentationIntro projectId={project.id} content={content} onImageFailed={previewFailed} />}
            <div className={cx("pc-drop", dropping && "on")} onDragEnter={dragEnter} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
                {dropping && <div className="pc-drop-cue" aria-hidden="true">Drop to upload to {label}</div>}
                <Panel title={label} sub={files ? COPY[section].sub : `${COPY[section].sub} Chosen in Project files; clients only see what you publish.`}
                    tools={canUpload && (
                        <>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => chooser.current?.click()}><Icon name="upload" />Upload files</button>
                            <input ref={chooser} type="file" multiple hidden accept={accept} aria-label="Files to upload" onChange={chosen} />
                            <input ref={replacer} type="file" hidden accept={accept} aria-label="New file for the card" onChange={replacementChosen} />
                        </>
                    )}>
                    {files && (
                        <div className="pc-strip">
                            <span>{`${plural(usage.files, "file")} · ${fmtBytes(usage.originalBytes)} original · ${fmtBytes(usage.storedBytes)} stored`}</span>
                            <span className="hint">Stored size is what the file storage reports; no compression is applied.</span>
                        </div>
                    )}
                    {files && !storageReady && (
                        <div className="banner hold pc-note">
                            <Icon name="info" />
                            <div className="grow">File storage for project files isn't set up yet. Ask your administrator.</div>
                        </div>
                    )}
                    {locked && (
                        <div className="banner pc-note">
                            <Icon name="lock" />
                            <div className="grow">{locked}</div>
                        </div>
                    )}
                    <UploadQueue rows={rows} onCancel={uploads.cancel} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
                    {items.length > 0 ? (
                        <CardGrid projectId={project.id} mode={mode} section={section} items={items}
                            canEdit={data.canEdit} canReplace={canUpload} canChoose={data.canChoose} canSort={data.canSort}
                            onPreviewFailed={previewFailed} onReplace={askForReplacement} onComments={onComments} />
                    ) : files ? (
                        <Empty art="projects" title={COPY[section].emptyTitle} text={canUpload ? `${COPY[section].empty} Drag files here or use Upload files.` : undefined} />
                    ) : (
                        <Empty art="projects" title={COPY[section].noneChosen}
                            text={data.canChoose ? "Choose the client's files in Project files, with Show to client." : "The files chosen for the client appear here."}
                            action={<Link className="btn btn-sm" to={{ search: `?tab=files&part=${section}` }}><Icon name="folder" />Open Project files</Link>} />
                    )}
                </Panel>
            </div>
        </>
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
