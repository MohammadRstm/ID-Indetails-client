import { useState } from "react";
import { toApiError } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";
import { boqErrorMessage, copyableBoqs, sourceLabel } from "./boqRules";
import { BOQ_REASON_MAX, BOQ_TITLE_MAX, useCreateBoq, type BoqKind, type BoqList } from "./boqsApi";

const HEADINGS: Record<BoqKind, string> = { internal: "New draft", client: "New client BOQ", vo: "New VO" };
const DEFAULT_TITLES: Record<BoqKind, string> = { internal: "Internal draft", client: "Client BOQ", vo: "Variation order" };

/**
 * Starts a draft, empty or copied from a BOQ the caller can see (an internal draft is the usual start of a client
 * BOQ). The title is optional; a VO says why it is needed. The editor opens on it once it is made.
 */
export default function NewBoqModal({ project, kind, list, onClose, onCreated }: {
    project: Project; kind: BoqKind; list: BoqList | undefined; onClose: () => void; onCreated: (id: number) => void;
}) {
    const create = useCreateBoq(project.id);
    const [title, setTitle] = useState("");
    const [reason, setReason] = useState("");
    const [from, setFrom] = useState("");
    const errors = useFormErrors();
    const sources = copyableBoqs(list);
    const fields = toApiError(create.error).fieldErrors;
    const titleError = title.trim().length > BOQ_TITLE_MAX && `At most ${BOQ_TITLE_MAX} characters.`;
    const reasonError = kind === "vo" && (!reason.trim() ? "Say why the variation is needed." : reason.trim().length > BOQ_REASON_MAX && `At most ${BOQ_REASON_MAX} characters.`);
    const failed = create.error && Object.keys(fields).length === 0;

    function submit() {
        if (create.isPending) return;
        errors.tried();
        if (titleError || reasonError) return;
        create.mutate({
            kind, title: title.trim() || undefined, reason: kind === "vo" ? reason.trim() : undefined, fromBoqId: from ? Number(from) : undefined,
        }, {
            onSuccess: (boq) => {
                toast({ text: `${boq.number ?? boq.title} started`, sub: project.title, icon: "checkCircle" });
                onCreated(boq.id);
            },
        });
    }

    return (
        <Modal size="md" title={HEADINGS[kind]} sub={project.title} onClose={create.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{failed && <span className="err"><Icon name="alert" />{boqErrorMessage(create.error)}</span>}</div>
                    <button className="btn" disabled={create.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={create.isPending} onClick={submit}>{create.isPending ? "Creating…" : "Create"}</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="new-boq-title">Title <span className="muted">(optional)</span></label>
                <input id="new-boq-title" className="input" placeholder={DEFAULT_TITLES[kind]} value={title}
                    onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                <FieldError message={errors.show("title", titleError) ?? fields.title} />
            </div>
            {kind === "vo" && (
                <div className="field mt">
                    <label className="label required" htmlFor="new-boq-reason">Why is it needed?</label>
                    <AutoGrowTextarea id="new-boq-reason" className="input" minRows={3} maxRows={8} value={reason}
                        placeholder="e.g. The client asked for a fence along the north side." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                    <div className="hint">The client sees it on the VO.</div>
                    <FieldError message={errors.show("reason", reasonError) ?? fields.reason} />
                </div>
            )}
            {sources.length > 0 && (
                <div className="field mt">
                    <label className="label" htmlFor="new-boq-from">Start from</label>
                    <Select id="new-boq-from" value={from} onChange={setFrom}
                        options={[{ value: "", label: "An empty BOQ" }, ...sources.map((b) => ({ value: String(b.id), label: sourceLabel(b) }))]} />
                    <div className="hint">Copies every line; the copy is yours to change, and the original stays as it is.</div>
                    <FieldError message={fields.fromBoqId} />
                </div>
            )}
        </Modal>
    );
}
