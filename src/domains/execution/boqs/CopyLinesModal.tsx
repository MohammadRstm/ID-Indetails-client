import { useState } from "react";
import { toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";
import { boqErrorMessage, copyableBoqs, sourceLabel } from "./boqRules";
import { useBoq, useCopyBoqLines, type Boq, type BoqList } from "./boqsApi";

/**
 * Appends lines of another BOQ the caller can see to this draft: all of them, or the ones ticked. The lines are
 * copied as they are, quantities and waste included, and the draft is saved with them.
 */
export default function CopyLinesModal({ project, boq, list, onCopied, onClose }: {
    project: Project; boq: Boq; list: BoqList | undefined; onCopied: (saved: Boq) => void; onClose: () => void;
}) {
    const copy = useCopyBoqLines(project.id, boq.id);
    const sources = copyableBoqs(list).filter((b) => b.id !== boq.id);
    const [from, setFrom] = useState("");
    // the lines left out; everything is in until it is unticked
    const [off, setOff] = useState<Record<number, boolean>>({});
    const source = useBoq(project.id, from ? Number(from) : null);
    const lines = source.data?.lines ?? [];
    const chosen = lines.filter((l) => !off[l.id]);
    const fields = toApiError(copy.error).fieldErrors;
    const failed = copy.error && Object.keys(fields).length === 0;

    function submit() {
        if (copy.isPending || !from || chosen.length === 0) return;
        copy.mutate({ fromBoqId: Number(from), lineIds: chosen.length === lines.length ? undefined : chosen.map((l) => l.id) }, {
            onSuccess: (saved) => {
                toast({ text: `${plural(chosen.length, "line")} copied`, sub: `Added to ${boq.number ?? boq.title}`, icon: "checkCircle" });
                onCopied(saved);
            },
        });
    }

    return (
        <Modal size="md" title="Copy lines" sub={boq.number ?? boq.title} onClose={copy.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{failed && <span className="err"><Icon name="alert" />{boqErrorMessage(copy.error)}</span>}</div>
                    <button className="btn" disabled={copy.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={copy.isPending || chosen.length === 0} onClick={submit}>
                        {copy.isPending ? "Copying…" : chosen.length ? `Copy ${plural(chosen.length, "line")}` : "Copy lines"}
                    </button>
                </>
            }>
            {sources.length === 0 ? <p className="muted" style={{ margin: 0 }}>No other BOQ on this site has lines to copy yet.</p> : (
                <>
                    <div className="field">
                        <label className="label required" htmlFor="copy-from">Copy from</label>
                        <Select id="copy-from" value={from} onChange={(v) => { setFrom(v); setOff({}); }}
                            options={sources.map((b) => ({ value: String(b.id), label: sourceLabel(b) }))} />
                        <FieldError message={fields.fromBoqId} />
                    </div>
                    {from && (loadFailed(source) ? <LoadError error={source.error} retry={() => source.refetch()} what="its lines" />
                        : !source.data ? <SkeletonLines lines={4} /> : (
                            <div className="mt">
                                <div className="spread" style={{ marginBottom: 6 }}>
                                    <span className="u">{chosen.length} of {plural(lines.length, "line")} chosen</span>
                                    <span className="row" style={{ gap: 4 }}>
                                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOff({})}>All</button>
                                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOff(Object.fromEntries(lines.map((l) => [l.id, true])))}>None</button>
                                    </span>
                                </div>
                                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                                    {lines.map((l, i) => (
                                        <label key={l.id} className="row" style={{ gap: 8, padding: "5px 0", alignItems: "flex-start" }}>
                                            <input type="checkbox" checked={!off[l.id]} aria-label={`Line ${i + 1}: ${l.description}`}
                                                onChange={(e) => setOff((o) => ({ ...o, [l.id]: !e.target.checked }))} />
                                            <span className="mono muted" style={{ minWidth: 40 }}>{l.code ?? ""}</span>
                                            <span className="grow">{l.description}</span>
                                            <span className="mono muted nowrap">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</span>
                                        </label>
                                    ))}
                                </div>
                                <FieldError message={fields.lineIds} />
                            </div>
                        ))}
                </>
            )}
        </Modal>
    );
}
