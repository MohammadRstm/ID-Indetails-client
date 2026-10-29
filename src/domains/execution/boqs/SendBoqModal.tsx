import { useState } from "react";
import { toApiError } from "@/api/errors";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { isEmail } from "@/shared/utils/email";
import { channelsOf, waLink } from "../../shared/billing/channels";
import { useClient } from "../../shared/clients/clientsApi";
import type { Project } from "../../shared/projects/projectsApi";
import { boqErrorMessage } from "./boqRules";
import { BOQ_NOTE_MAX, downloadBoqPdf, useEmailBoq, useRecordBoqDelivery, type Boq } from "./boqsApi";

type Way = "email" | "whatsapp" | "download";

/**
 * How a client BOQ or VO reaches the client: the PDF by email from the server, a WhatsApp message (the chat opens
 * with it ready, and the send is recorded), or the PDF downloaded to send some other way (recorded too). It can be
 * sent as often as needed, and a send that fails records nothing.
 */
export default function SendBoqModal({ project, boq, onClose }: { project: Project; boq: Boq; onClose: () => void }) {
    const company = useCompanySettings().data;
    const client = useClient(project.client?.id).data;
    const email = useEmailBoq(project.id);
    const record = useRecordBoqDelivery(project.id);
    const channels = channelsOf(client?.contacts);
    const emails = channels.filter((c) => c.channel === "email");
    const numbers = channels.filter((c) => c.channel === "whatsapp");
    const [way, setWay] = useState<Way>("email");
    const [to, setTo] = useState<string | null>(null);
    const [number, setNumber] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [failure, setFailure] = useState<unknown>(null);
    const [busy, setBusy] = useState(false);
    const errors = useFormErrors();
    const name = boq.number ?? boq.title;
    const address = to ?? emails[0]?.value ?? "";
    const chosenNumber = numbers.find((c) => c.value === (number ?? numbers[0]?.value)) ?? null;
    const firstName = (client?.name ?? project.client?.displayName ?? "").split(" ")[0];

    const addressError = way === "email" && (!address.trim() ? "Enter the email address to send it to." : !isEmail(address) && "Enter an email like name@company.com.");
    const noteError = note.trim().length > BOQ_NOTE_MAX && `At most ${BOQ_NOTE_MAX} characters.`;
    const noWhatsapp = way === "whatsapp" && !chosenNumber;
    const fields = toApiError(failure).fieldErrors;

    async function send() {
        if (busy) return;
        errors.tried();
        if (addressError || noteError || noWhatsapp) return;
        setBusy(true);
        setFailure(null);
        const text = note.trim() || undefined;
        // the chat opens in a tab of its own; it is opened now, while the click still allows it
        const tab = way === "whatsapp" ? window.open("", "_blank") : null;
        if (tab) tab.opener = null;
        try {
            if (way === "email") {
                await email.mutateAsync({ id: boq.id, to: address.trim(), note: text });
            } else if (way === "whatsapp") {
                await record.mutateAsync({ id: boq.id, body: { channel: "whatsapp", recipient: chosenNumber!.value, note: text } });
                const toPay = boq.clientTotalUsd == null ? "" : `: ${money.exact(boq.clientTotalUsd, "USD", { cents: true })} to pay, TVA included`;
                const message = `Hello ${firstName} - here is ${name} for ${project.title}${toPay}. ${company?.name ?? ""}`;
                if (tab) tab.location.href = waLink(chosenNumber!.value, message.trim());
            } else {
                await record.mutateAsync({ id: boq.id, body: { channel: "download", note: text } });
                await downloadBoqPdf(boq);
            }
            toast({
                text: way === "email" ? `${name} emailed to ${address.trim()}` : way === "whatsapp" ? `${name} shared on WhatsApp` : `${name} downloaded`,
                sub: `${money.exact(boq.totalUsd, "USD", { cents: true })} · ${project.title}`, icon: "send",
            });
            onClose();
        } catch (e) {
            tab?.close();
            setFailure(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal size="md" title={`Send ${name}`} sub={`${project.client?.displayName ?? "the client"} · ${boq.title}`} onClose={busy ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{failure != null && <span className="err"><Icon name="alert" />{boqErrorMessage(failure)}</span>}</div>
                    <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
                        <Icon name={way === "download" ? "download" : way === "email" ? "mail" : "send"} />
                        {busy ? "Sending…" : way === "email" ? "Send email" : way === "whatsapp" ? "Open WhatsApp" : "Download PDF"}
                    </button>
                </>
            }>
            <Segmented value={way} onChange={setWay} aria-label="How to send it" options={[
                { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "download", label: "PDF" },
            ]} />

            {way === "email" && (
                <div className="field mt">
                    <label className="label required" htmlFor="boq-to">Send it to</label>
                    <input id="boq-to" className="input" type="email" placeholder="name@company.com" value={address}
                        onChange={(e) => setTo(e.target.value)} onBlur={errors.touch("to")} />
                    {emails.length > 1 && (
                        <div className="row wrap mt-s" style={{ gap: 6 }}>
                            {emails.map((c) => (
                                <button key={c.key} type="button" className={cx("chip", address === c.value && "on")} aria-pressed={address === c.value} onClick={() => setTo(c.value)}>
                                    {c.value}{c.label ? ` · ${c.label}` : ""}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="hint">The PDF goes out from ID InDetails, attached to the email.</div>
                    <FieldError message={errors.show("to", addressError) ?? fields.to} />
                </div>
            )}
            {way === "whatsapp" && (numbers.length ? (
                <div className="field mt">
                    <label className="label required" htmlFor="boq-wa">Send it to</label>
                    <Select id="boq-wa" value={chosenNumber?.value ?? ""} onChange={setNumber}
                        options={numbers.map((c) => ({ value: c.value, label: `${c.value}${c.label ? ` · ${c.label}` : ""}` }))} />
                    <div className="hint">WhatsApp opens with a short message ready to send; the PDF can't be attached there, so send it yourself too.</div>
                </div>
            ) : (
                <div className="banner hold mt">
                    <Icon name="alert" />
                    <div className="grow">This client has no WhatsApp number saved. Add one on the client's page, or send the PDF another way.</div>
                </div>
            ))}
            {way === "download" && (
                <p className="hint mt">Downloads the PDF to send yourself, and records that it went out.</p>
            )}

            <div className="field mt">
                <label className="label" htmlFor="boq-note">Note <span className="muted">(optional)</span></label>
                <AutoGrowTextarea id="boq-note" className="input" minRows={2} maxRows={6} value={note}
                    placeholder={way === "email" ? "A few words for the client, shown in the email." : "Kept with the delivery."}
                    onChange={(e) => setNote(e.target.value)} onBlur={errors.touch("note")} />
                <FieldError message={errors.show("note", noteError) ?? fields.note} />
            </div>
        </Modal>
    );
}
