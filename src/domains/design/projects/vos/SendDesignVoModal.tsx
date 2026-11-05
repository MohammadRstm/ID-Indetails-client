import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { isEmail } from "@/shared/utils/email";
import { channelsOf } from "../../../shared/billing/channels";
import { useClient } from "../../../shared/clients/clientsApi";
import type { Project } from "../../../shared/projects/projectsApi";
import { downloadDesignVoPdf, useEmailDesignVo, type DesignVo } from "./designVosApi";

/** How a variation order reaches the client: its PDF by email from the server, or downloaded to send some other way. */
export default function SendDesignVoModal({ project, vo, onClose }: { project: Project; vo: DesignVo; onClose: () => void }) {
    const client = useClient(project.client?.id).data;
    const emails = channelsOf(client?.contacts).filter((c) => c.channel === "email");
    const email = useEmailDesignVo();
    const errors = useFormErrors();
    const [way, setWay] = useState<"email" | "download">("email");
    const [to, setTo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const address = to ?? emails[0]?.value ?? "";
    const addressError = way === "email" && (!address.trim() ? "Enter the email address to send it to." : !isEmail(address) && "Enter an email like name@company.com.");

    async function send() {
        if (busy) return;
        if (addressError) return errors.tried();
        setBusy(true);
        try {
            if (way === "email") await email.mutateAsync({ id: vo.id, to: address.trim() });
            else await downloadDesignVoPdf(vo);
            toast({
                text: way === "email" ? `${vo.number} emailed to ${address.trim()}` : `${vo.number} downloaded`,
                sub: `${money.exact(vo.totalWithTvaUsd, "USD", { cents: true })} with TVA · ${project.title}`, icon: "send",
            });
            onClose();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal size="md" title={`Send ${vo.number}`} sub={`${project.client?.displayName ?? "the client"} · ${vo.title}`} onClose={busy ? undefined : onClose}
            foot={
                <>
                    <div className="grow">{email.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(email.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose} disabled={busy}>{vo.status === "pending" ? "Later" : "Cancel"}</button>
                    <button className="btn btn-primary" onClick={() => void send()} disabled={busy}>
                        <Icon name={way === "email" ? "send" : "download"} />{way === "email" ? "Email it" : "Download PDF"}
                    </button>
                </>
            }>
            <Segmented aria-label="How it goes" value={way} onChange={setWay}
                options={[{ value: "email", label: "Email" }, { value: "download", label: "Download PDF" }]} />
            {way === "email" ? (
                <div className="field mt">
                    <label className="label required" htmlFor="vo-to">To</label>
                    <input id="vo-to" className="input" type="email" value={address} onChange={(e) => setTo(e.target.value)} onBlur={errors.touch("to")} />
                    {errors.show("to", addressError) ? <FieldError message={errors.show("to", addressError)} />
                        : <div className="hint">The PDF goes attached, with the changes and totals in the email.</div>}
                </div>
            ) : <div className="hint mt">To send it on WhatsApp or by hand.</div>}
            {vo.status === "pending" && <div className="hint mt">Once the client agrees, mark it "The client confirmed it": then it joins the price.</div>}
        </Modal>
    );
}
