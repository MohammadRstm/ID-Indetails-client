import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import Panel from "@/shared/components/Data/Panel";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { fmtTime, MONTHS, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { SECTION_LABEL, useDiscard, usePortalContent, usePublish, type PortalChanges, type PortalContent } from "./contentApi";
import { useUploads } from "./useUploads";

const HINT_ID = "pc-publish-hint";

/** "14 Oct 2026, 3:20 PM", in the company's time zone and clock. */
function when(instant: string): string {
    const p = partsOf(instant);
    return `${p.day} ${MONTHS[p.month]} ${p.year}, ${fmtTime(instant)}`;
}

const changeCount = (c: PortalChanges) => c.added + c.updated + c.removed + c.reordered.length + (c.heroChanged ? 1 : 0) + (c.summaryChanged ? 1 : 0);

/** What clients would get on the next publish, one line each. */
function changeLines(content: PortalContent): string[] {
    const { added, updated, removed, reordered, heroChanged, summaryChanged } = content.changes;
    return [
        added > 0 && plural(added, "new file"),
        updated > 0 && plural(updated, "updated file"),
        removed > 0 && `${plural(removed, "file")} removed`,
        ...reordered.map((section) => `New order in ${SECTION_LABEL[section]}`),
        heroChanged && (content.hero ? "New hero image" : "Hero image removed"),
        summaryChanged && (content.summary ? "New introduction" : "Introduction removed"),
    ].filter((line): line is string => typeof line === "string");
}

/** Where the client portal stands: published when and by whom, how much is unpublished, and what can be done about it. */
function statusOf(content: PortalContent): { published: string; changes: string } {
    const { publishedAt, publishedBy } = content.publication;
    const count = changeCount(content.changes);
    return {
        published: publishedAt ? `Published ${when(publishedAt)}${publishedBy ? ` by ${publishedBy.name}` : ""}` : "Not published yet",
        changes: count > 0 ? plural(count, "unpublished change") : content.hasUnpublishedChanges ? "Unpublished changes"
            : publishedAt ? "Everything is published" : "Nothing to publish yet",
    };
}

/**
 * The slim panel above the client portal's parts: whether clients have been given anything and what is still
 * unpublished, with Preview, and for client_portal:manage Discard changes and Publish changes. Without it, or on an
 * archived project, it only says where things stand, and previews.
 */
export default function PublishBar({ projectId, onPreview }: { projectId: number; onPreview: () => void }) {
    const content = usePortalContent(projectId);
    const uploads = useUploads(projectId);
    const [asking, setAsking] = useState<"publish" | "discard" | null>(null);
    const data = content.data;
    if (!data) return null;

    const status = statusOf(data);
    const waiting = data.canEdit && uploads.busy;

    return (
        <Panel className="pc-status" bodyClassName="pc-status-body">
            <div className="pc-status-main">
                <div className="pc-status-line">
                    <Icon name={data.publication.publishedAt ? "checkCircle" : "info"} />
                    <b>{status.published}</b>
                    <span className="muted">· {status.changes}</span>
                </div>
                {waiting && <div id={HINT_ID} className="hint">Publishing waits until the uploads have finished.</div>}
            </div>
            <div className="pc-status-actions">
                <button type="button" className="btn" onClick={onPreview}><Icon name="eye" />Preview</button>
                {data.canEdit && data.canDiscard && <button type="button" className="btn btn-danger" onClick={() => setAsking("discard")}>Discard changes</button>}
                {data.canEdit && (
                    <button type="button" className="btn btn-primary" disabled={!data.canPublish || uploads.busy} aria-describedby={waiting ? HINT_ID : undefined}
                        onClick={() => setAsking("publish")}>
                        <Icon name="send" />Publish changes
                    </button>
                )}
            </div>
            {asking === "publish" && <PublishModal projectId={projectId} content={data} onClose={() => setAsking(null)} />}
            {asking === "discard" && <DiscardModal projectId={projectId} content={data} onClose={() => setAsking(null)} />}
        </Panel>
    );
}

type ModalProps = { projectId: number; content: PortalContent; onClose: () => void };

/** Lists what clients will get, and publishes it all at once. */
function PublishModal({ projectId, content, onClose }: ModalProps) {
    const publish = usePublish(projectId);
    const lines = changeLines(content);

    async function submit() {
        try {
            await publish.mutateAsync(content.revision);
            toast({ text: "Published. Clients now see this version.", icon: "checkCircle" });
            onClose();
        } catch (error) {
            // the drafts changed meanwhile: they were loaded again and the person told, so the window gives way to them
            if (toApiError(error).code === "portal_revision_stale") onClose();
        }
    }

    return (
        <Modal title="Publish to your client?" onClose={onClose}
            foot={
                <>
                    <div className="grow">{publish.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(publish.error)}</span> : null}</div>
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={publish.isPending || !content.canPublish} onClick={() => void submit()}>Publish changes</button>
                </>
            }>
            <p>Clients will get:</p>
            <ul className="pc-changes">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
            <p>Clients see this version at once. Nobody is notified yet.</p>
        </Modal>
    );
}

/** Asks before the client's choices are put back to what clients see. */
function DiscardModal({ projectId, content, onClose }: ModalProps) {
    const discard = useDiscard(projectId);

    async function submit() {
        try {
            await discard.mutateAsync(content.revision);
            toast({ text: "Changes discarded", sub: "The client's files, hero and introduction are what clients see again.", icon: "refresh" });
            onClose();
        } catch (error) {
            if (toApiError(error).code === "portal_revision_stale") onClose();
        }
    }

    return (
        <Modal title="Discard changes?" onClose={onClose}
            foot={
                <>
                    <div className="grow">{discard.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(discard.error)}</span> : null}</div>
                    <button type="button" className="btn" onClick={onClose}>Keep the drafts</button>
                    <button type="button" className="btn btn-danger" disabled={discard.isPending} onClick={() => void submit()}>Discard changes</button>
                </>
            }>
            <p>Put the client's files, the hero image and the introduction back to what clients see? The files themselves stay in Project files. This can't be undone.</p>
        </Modal>
    );
}
