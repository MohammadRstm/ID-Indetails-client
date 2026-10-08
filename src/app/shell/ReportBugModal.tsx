import { useState } from "react";
import { useLocation } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { http } from "@/api/http";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";

const MAX_TITLE = 120;
/** Who supports the product, for people who'd rather message than fill in the form. */
const SUPPORT_WHATSAPP = "96171317958";
const SUPPORT_WHATSAPP_SHOWN = "+961 71 317 958";
const SUPPORT_EMAIL = "mohammadrstm2004@gmail.com";
const MAX_TEXT = 4000;

/**
 * "Report a bug": what went wrong, in the person's words, emailed to the people who support the product. The API
 * adds who sent it and from which browser; the page goes as its path only, so no link token travels with it.
 */
export default function ReportBugModal({ onClose }: { onClose: () => void }) {
    const { pathname } = useLocation();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [steps, setSteps] = useState("");
    const errors = useFormErrors();
    const send = useMutation({
        mutationFn: async () => {
            await http.post("/bug-reports", { title: title.trim(), description: description.trim(), steps: steps.trim() || null, page: pathname });
        },
    });
    const titleError = !title.trim() ? "Say in a few words what went wrong." : title.length > MAX_TITLE && `At most ${MAX_TITLE} characters.`;
    const descriptionError = !description.trim() ? "Describe what happened." : description.length > MAX_TEXT && `At most ${MAX_TEXT} characters.`;
    const stepsError = steps.length > MAX_TEXT && `At most ${MAX_TEXT} characters.`;
    // whatever has been typed so far goes with the message, with the page it happened on
    const draft = [title.trim(), description.trim(), steps.trim() && `Steps:\n${steps.trim()}`, `Page: ${pathname}`].filter(Boolean).join("\n\n");
    const whatsapp = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Bug report (ID InDetails)\n\n${draft}`)}`;
    const email = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Bug report: ${title.trim() || "ID InDetails"}`)}&body=${encodeURIComponent(draft)}`;

    function submit() {
        if (send.isPending) return;
        if (titleError || descriptionError || stepsError) return errors.tried();
        send.mutate(undefined, {
            onSuccess: () => {
                toast({ text: "Thanks - your report was sent", sub: "We'll look into it.", icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal surfaceId="report_bug" title="Report a bug" sub="Tell us what went wrong, and we'll look into it." onClose={onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {send.error ? <span className="err"><Icon name="alert" />{errorMessage(send.error)}</span>
                            : "Sent with this page's address, your browser and your name."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={send.isPending} onClick={submit}>{send.isPending ? "Sending…" : "Send report"}</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="bug-title">What went wrong</label>
                <input id="bug-title" className="input" autoFocus maxLength={MAX_TITLE} placeholder="e.g. The timer stopped when I changed page"
                    value={title} onChange={(e) => setTitle(e.target.value.replace(/[\r\n]/g, " "))} onBlur={errors.touch("title")} />
                <FieldError message={errors.show("title", titleError)} />
            </div>
            <div className="field">
                <label className="label required" htmlFor="bug-description">What happened</label>
                <textarea id="bug-description" className="textarea" rows={4} maxLength={MAX_TEXT} placeholder="What you saw, and what you expected instead"
                    value={description} onChange={(e) => setDescription(e.target.value)} onBlur={errors.touch("description")} />
                <FieldError message={errors.show("description", descriptionError)} />
            </div>
            <div className="field">
                <label className="label optional" htmlFor="bug-steps">Steps to make it happen again</label>
                <textarea id="bug-steps" className="textarea" rows={3} maxLength={MAX_TEXT} placeholder="1. Open… 2. Click…"
                    value={steps} onChange={(e) => setSteps(e.target.value)} onBlur={errors.touch("steps")} />
                <FieldError message={errors.show("steps", stepsError)} />
                <div className="hint">Please leave out passwords and other private details.</div>
            </div>
            <div className="bug-direct">
                <div>
                    <div className="strong">Prefer to message us directly?</div>
                    <div className="hint">Anything you've typed above goes with it.</div>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                    <a className="btn btn-sm" href={whatsapp} target="_blank" rel="noreferrer" title={`WhatsApp ${SUPPORT_WHATSAPP_SHOWN}`}>
                        <Icon name="chat" />WhatsApp
                    </a>
                    <a className="btn btn-sm" href={email} title={`Email ${SUPPORT_EMAIL}`}>
                        <Icon name="mail" />Email
                    </a>
                </div>
            </div>
        </Modal>
    );
}
