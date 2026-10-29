import { useState } from "react";
import { toApiError } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { AMOUNT, BOQ_PERCENT } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { useBoqAccess } from "./boqAccess";
import { AgreeBoqModal, WithdrawBoqModal } from "./BoqAgreementModals";
import { blankLine, draftOf, fitSigned, hasProblems, isDirty, problemsOf, requestOf, type Draft, type LineDraft } from "./boqDraft";
import { BoqDeliveries, BoqTotals } from "./BoqFigures";
import BoqLinesTable from "./BoqLinesTable";
import { useBoqLinks } from "./boqLinks";
import { agreeBlock, agreedClient, boqErrorMessage, emptyBlock, isNotChosen, KIND_LABEL, withdrawBlock } from "./boqRules";
import { BOQ_MAX_LINES, BOQ_REASON_MAX, BOQ_TITLE_MAX, downloadBoqPdf, useBoqs, useDeleteBoq, useDuplicateBoq, useSaveBoq, type Boq, type BoqAdjustmentType } from "./boqsApi";
import CopyLinesModal from "./CopyLinesModal";
import SendBoqModal from "./SendBoqModal";

type Dialog = "agree" | "withdraw" | "send" | "copy" | "delete" | null;

const SAVE_FIRST = "Save your changes first.";

/**
 * A BOQ, VO or internal draft to read or write: its title and reason, its lines, the whole-BOQ adjustment and the
 * figures of its last save. Every figure comes from that save: the API works them all out, and a line changed since
 * shows a dash until it is saved. An agreed BOQ opens read-only.
 */
export default function BoqSheet({ project, boq, onClose }: { project: Project; boq: Boq; onClose: () => void }) {
    const access = useBoqAccess(project);
    const links = useBoqLinks();
    const list = useBoqs(project.id, true).data;
    const save = useSaveBoq(project.id, boq.id);
    const duplicate = useDuplicateBoq();
    const remove = useDeleteBoq(project.id);
    const errors = useFormErrors();
    const [draft, setDraft] = useState(() => draftOf(boq));
    const [dialog, setDialog] = useState<Dialog>(null);

    const name = boq.number ?? boq.title;
    const editable = access.canEdit(boq);
    const dirty = editable && isDirty(draft, boq);
    const problems = problemsOf(draft, boq.kind);
    const fields = toApiError(save.error).fieldErrors;
    const agreed = boq.status === "agreed";
    const chosen = agreedClient(list);
    const notChosen = isNotChosen(boq, list);
    const decides = access.canDecide(boq);
    const blocked = emptyBlock(boq);
    const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
    const changeLine = (key: string, field: keyof LineDraft, value: string) =>
        setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)) }));

    function close() {
        if (dirty && !window.confirm("Discard the changes made since the last save?")) return;
        onClose();
    }
    function submit() {
        if (save.isPending || !editable) return;
        errors.tried();
        if (hasProblems(problems)) return;
        save.mutate(requestOf(draft, boq.kind), {
            onSuccess: (saved) => {
                setDraft(draftOf(saved));
                toast({ text: `${saved.number ?? saved.title} saved`, sub: money.exact(saved.totalUsd, "USD", { cents: true }), icon: "checkCircle" });
            },
        });
    }
    function move(index: number, by: -1 | 1) {
        setDraft((d) => {
            const lines = d.lines.slice();
            [lines[index], lines[index + by]] = [lines[index + by], lines[index]];
            return { ...d, lines };
        });
    }
    function copy() {
        duplicate.mutate(boq.id, {
            onSuccess: (made) => {
                toast({ text: `${made.number ?? made.title} made`, sub: `A copy of ${name}, as a draft`, icon: "checkCircle" });
                links.open(made.id);
            },
            onError: (e) => toast({ text: "It wasn't duplicated", sub: boqErrorMessage(e), icon: "alert" }),
        });
    }
    function pdf() {
        downloadBoqPdf(boq).catch((e) => toast({ text: "The PDF wasn't downloaded", sub: boqErrorMessage(e), icon: "alert" }));
    }

    const setAdjustment = (adjustment: BoqAdjustmentType) => change({ adjustment, adjustmentValue: "" });

    return (
        <Modal size="xl" title={name} sub={`${KIND_LABEL[boq.kind]}${boq.number ? ` · ${boq.title}` : ""} · ${project.title}`} onClose={close}
            headTools={
                <span className="row" style={{ gap: 8 }}>
                    <span className={cx("badge", agreed && "badge-active")}>{agreed ? "Agreed" : notChosen ? "Not chosen" : "Draft"}</span>
                    {(access.canDuplicate(boq) || editable || access.canDownload(boq)) && (
                        <MenuButton icon="dots" label="More actions" align="right" width={210}>
                            {(done) => (
                                <div>
                                    {access.canDuplicate(boq) && <button className="pop-item" disabled={dirty || duplicate.isPending} title={dirty ? SAVE_FIRST : undefined} onClick={() => { done(); copy(); }}><Icon name="file" />Duplicate</button>}
                                    {editable && <button className="pop-item" disabled={dirty} title={dirty ? SAVE_FIRST : undefined} onClick={() => { done(); setDialog("copy"); }}><Icon name="list" />Copy lines from…</button>}
                                    {access.canDownload(boq) && <button className="pop-item" disabled={dirty} title={dirty ? SAVE_FIRST : undefined} onClick={() => { done(); pdf(); }}><Icon name="download" />Download PDF</button>}
                                    {editable && <button className="pop-item" onClick={() => { done(); setDialog("delete"); }}><Icon name="trash" />Delete draft</button>}
                                </div>
                            )}
                        </MenuButton>
                    )}
                </span>
            }
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error ? <span className="err"><Icon name="alert" />{boqErrorMessage(save.error)}</span> : dirty ? "Unsaved changes" : null}
                    </div>
                    <button className="btn" onClick={close}>{editable ? "Cancel" : "Close"}</button>
                    {decides && (
                        <button className="btn" disabled={dirty || !!blocked} title={dirty ? SAVE_FIRST : blocked ?? undefined} onClick={() => setDialog("send")}><Icon name="send" />Send…</button>
                    )}
                    {decides && !agreed && (
                        <button className="btn" disabled={dirty || !!agreeBlock(boq, list)} title={dirty ? SAVE_FIRST : agreeBlock(boq, list) ?? undefined} onClick={() => setDialog("agree")}><Icon name="checkCircle" />Agree</button>
                    )}
                    {decides && agreed && (
                        <button className="btn" disabled={!!withdrawBlock(boq, list)} title={withdrawBlock(boq, list) ?? undefined} onClick={() => setDialog("withdraw")}><Icon name="x" />Withdraw agreement</button>
                    )}
                    {editable && <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>}
                </>
            }>
            {agreed && (
                <div className="banner done" style={{ marginBottom: 14 }}>
                    <Icon name="lock" />
                    <div className="grow">
                        <b>Agreed{boq.agreedAt ? ` on ${fmtDateY(boq.agreedAt)}` : ""}{boq.agreedBy ? ` by ${boq.agreedBy.name}` : ""}.</b> It is locked and its total is part of the site's work price.
                        {decides ? " Withdraw the agreement to change it." : ""}
                    </div>
                </div>
            )}
            {notChosen && (
                <div className="banner" style={{ marginBottom: 14 }}>
                    <Icon name="info" />
                    <div className="grow"><b>Not chosen.</b> {chosen?.number ?? "Another client BOQ"} is the agreed one. This stays a draft, to change, send or keep.</div>
                </div>
            )}
            {!agreed && !editable && (
                <div className="banner" style={{ marginBottom: 14 }}>
                    <Icon name="info" />
                    <div className="grow">{access.open ? "You can read this BOQ but not change it." : "The site is closed: a BOQ can't be changed until it is reopened."}</div>
                </div>
            )}

            <div className="field">
                <label className="label required" htmlFor="boq-title">Title</label>
                <input id="boq-title" className="input" value={draft.title} disabled={!editable} onChange={(e) => change({ title: e.target.value })} onBlur={errors.touch("title")} />
                <div className="hint">{boq.kind === "internal" ? "Only you and whoever manages the site's pricing see it." : "The client sees it on the PDF."} At most {BOQ_TITLE_MAX} characters.</div>
                <FieldError message={errors.show("title", problems.title) ?? fields.title} />
            </div>
            {boq.kind === "vo" && (
                <div className="field mt">
                    <label className="label required" htmlFor="boq-reason">Reason</label>
                    <AutoGrowTextarea id="boq-reason" className="input" minRows={2} maxRows={6} value={draft.reason} disabled={!editable}
                        onChange={(e) => change({ reason: e.target.value })} onBlur={errors.touch("reason")} />
                    <div className="hint">Why the variation is needed. The client sees it on the PDF. At most {BOQ_REASON_MAX} characters.</div>
                    <FieldError message={errors.show("reason", problems.reason) ?? fields.reason} />
                </div>
            )}

            <div className="spread mt" style={{ marginBottom: 6 }}>
                <span className="u">Lines · {draft.lines.length}</span>
                {editable && (
                    <button type="button" className="btn btn-sm" disabled={draft.lines.length >= BOQ_MAX_LINES} onClick={() => change({ lines: [...draft.lines, blankLine()] })}>
                        <Icon name="plus" />Add line
                    </button>
                )}
            </div>
            {draft.lines.length === 0 && <p className="muted" style={{ margin: "0 0 8px" }}>No lines yet.{editable ? " Add the first one." : ""}</p>}
            {draft.lines.length > 0 && (
                <BoqLinesTable lines={draft.lines} saved={boq.lines} readOnly={!editable} problems={problems} errors={errors}
                    onChange={changeLine} onMove={move} onRemove={(i) => change({ lines: draft.lines.filter((_, at) => at !== i) })} />
            )}
            <FieldError message={problems.lines} />
            {boq.kind !== "vo" && editable && <div className="hint mt-s">A negative rate is only allowed on a VO.</div>}

            <div className="field mt">
                <label className="label">Adjust the whole BOQ</label>
                <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
                    <Segmented value={draft.adjustment} onChange={setAdjustment} disabled={!editable} aria-label="Adjust the whole BOQ" options={[
                        { value: "none", label: "None" }, { value: "percent", label: "By %" }, { value: "total", label: "To a new total" },
                    ]} />
                    {draft.adjustment !== "none" && (
                        <input className="input mono" style={{ width: 130 }} inputMode="decimal" disabled={!editable}
                            aria-label={draft.adjustment === "percent" ? "Adjustment percent" : "New total"}
                            placeholder={draft.adjustment === "percent" ? "e.g. -5" : "e.g. 90000"} value={draft.adjustmentValue}
                            onBlur={errors.touch("adjustment")}
                            onChange={(e) => {
                                const next = fitSigned(e.target.value, draft.adjustment === "percent" ? BOQ_PERCENT : AMOUNT, draft.adjustmentValue, true);
                                if (next != null) change({ adjustmentValue: next });
                            }} />
                    )}
                    {draft.adjustment === "percent" && <span className="muted">% of the subtotal; a minus takes it off</span>}
                </div>
                <FieldError message={errors.show("adjustment", problems.adjustmentValue) ?? fields.adjustmentValue} />
            </div>

            <BoqTotals boq={boq} stale={dirty} />
            <BoqDeliveries boq={boq} />

            {dialog === "agree" && <AgreeBoqModal project={project} boq={boq} onClose={() => setDialog(null)} />}
            {dialog === "withdraw" && <WithdrawBoqModal project={project} boq={boq} onClose={() => setDialog(null)} />}
            {dialog === "send" && <SendBoqModal project={project} boq={boq} onClose={() => setDialog(null)} />}
            {dialog === "copy" && (
                <CopyLinesModal project={project} boq={boq} list={list}
                    onCopied={(saved) => { setDraft(draftOf(saved)); setDialog(null); }} onClose={() => setDialog(null)} />
            )}
            {dialog === "delete" && (
                <DeleteBoqModal name={name} pending={remove.isPending} error={remove.error}
                    onDelete={() => remove.mutate(boq.id, {
                        onSuccess: () => { toast({ text: `${name} deleted`, sub: project.title, icon: "trash" }); onClose(); },
                    })}
                    onClose={() => setDialog(null)} />
            )}
        </Modal>
    );
}

function DeleteBoqModal({ name, pending, error, onDelete, onClose }: { name: string; pending: boolean; error: unknown; onDelete: () => void; onClose: () => void }) {
    return (
        <Modal size="sm" title={`Delete ${name}?`} onClose={pending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{error != null && <span className="err"><Icon name="alert" />{boqErrorMessage(error)}</span>}</div>
                    <button className="btn" disabled={pending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={pending} onClick={onDelete}>{pending ? "Deleting…" : "Delete"}</button>
                </>
            }>
            <p style={{ margin: 0 }}>This draft and its lines are deleted. It can't be brought back.</p>
        </Modal>
    );
}
