import { useState } from "react";
import { toApiError } from "@/api/errors";
import { fullName, useCurrentUser } from "@/app/session/useSession";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { isEmail } from "@/shared/utils/email";
import { useClient } from "../clients/clientsApi";
import { RECEIPT_NOTE_MAX, downloadReceipt, receiptIntro, useEmailReceipt, type Payment } from "./billingApi";
import { channelsOf } from "./channels";

type Way = "email" | "download";

/**
 * The receipt that tells the client their payment arrived, opened as soon as a payment is recorded and from the
 * payment's menu afterwards: emailed by the server with its PDF, with a thank-you of its own and the sender's note, or
 * the PDF downloaded to send another way. The PDF shows the payment, what had been paid by it and what is still to pay;
 * the API works all of it out. Both businesses' payments have one.
 */
export default function SendReceiptModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
    const me = useCurrentUser();
    const company = useCompanySettings().data;
    const client = useClient(payment.client.id).data;
    const email = useEmailReceipt();
    const emails = channelsOf(client?.contacts).filter((c) => c.channel === "email");
    const [way, setWay] = useState<Way>("email");
    const [to, setTo] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [failure, setFailure] = useState<unknown>(null);
    const [busy, setBusy] = useState(false);
    const errors = useFormErrors();
    const address = to ?? emails[0]?.value ?? "";
    const amount = money.exact(payment.amount, payment.currency, { cents: true });
    const number = `R-${payment.id}`;

    const addressError = way === "email" && (!address.trim() ? "Enter the email address to send it to." : !isEmail(address) && "Enter an email like name@company.com.");
    const noteError = note.trim().length > RECEIPT_NOTE_MAX && `At most ${RECEIPT_NOTE_MAX.toLocaleString("en-US")} characters.`;
    const fields = toApiError(failure).fieldErrors;

    async function send() {
        if (busy) return;
        errors.tried();
        if (addressError || noteError) return;
        setBusy(true);
        setFailure(null);
        try {
            if (way === "email") await email.mutateAsync({ id: payment.id, to: address.trim(), note: note.trim() || undefined });
            else await downloadReceipt(payment.id);
            toast({
                text: way === "email" ? `Receipt emailed to ${address.trim()}` : "Receipt downloaded",
                sub: `${amount} · ${payment.project.title}`, icon: way === "email" ? "send" : "download",
            });
            onClose();
        } catch (e) {
            setFailure(e);
        } finally {
            setBusy(false);
        }
    }

    return (
        // it stays open while sending, so a failure shows here
        <Modal size="md" title="Send a receipt" sub={`${payment.client.displayName} · ${amount} received ${fmtDateY(payment.receivedOn)}`} onClose={busy ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {failure != null && !fields.to && !fields.note ? <span className="err" role="alert"><Icon name="alert" /><ErrorMessage error={failure} /></span> : null}
                    </div>
                    <button className="btn" disabled={busy} onClick={onClose}>Not now</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
                        <Icon name={way === "email" ? "mail" : "download"} />
                        {busy ? (way === "email" ? "Sending…" : "Downloading…") : way === "email" ? "Send email" : "Download PDF"}
                    </button>
                </>
            }>
            <Segmented value={way} onChange={setWay} aria-label="How to send it" options={[
                { value: "email", label: "Email" }, { value: "download", label: "PDF" },
            ]} />

            {way === "email" ? (
                <>
                    <div className="field mt">
                        <label className="label required" htmlFor="receipt-to">Send it to</label>
                        <input id="receipt-to" className="input" type="email" placeholder="name@company.com" value={address}
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
                        <FieldError message={errors.show("to", addressError) ?? fields.to} />
                    </div>

                    <div className="field mt">
                        <label className="label" htmlFor="receipt-note">Your note <span className="muted">(optional)</span></label>
                        <AutoGrowTextarea id="receipt-note" className="input" minRows={2} maxRows={6} value={note}
                            placeholder="A few words of your own, shown in the email under its opening."
                            onChange={(e) => setNote(e.target.value)} onBlur={errors.touch("note")} />
                        <FieldError message={errors.show("note", noteError) ?? fields.note} />
                    </div>

                    <div className="mt">
                        <div className="u" style={{ marginBottom: 4 }}>What they receive</div>
                        <div className="mail-preview">
                            <div className="mail-row"><span>To</span><b>{address.trim() || "-"}</b></div>
                            <div className="mail-row"><span>Subject</span><b>Receipt {number} - {payment.project.title}</b></div>
                            <p>Hello {payment.client.displayName},</p>
                            <p>{receiptIntro(payment.project.title, fmtDateY(payment.receivedOn))}</p>
                            {note.trim() && <p className="receipt-note">{note.trim()}</p>}
                            <p><b>Payment received: {amount}</b>. The receipt also shows what has been paid so far and what is still to pay.</p>
                            <p>With thanks,<br />{fullName(me)} · {company?.name ?? ""}</p>
                        </div>
                    </div>
                </>
            ) : (
                <p className="hint mt">Downloads the receipt as a PDF, to send yourself. Nothing is recorded.</p>
            )}
        </Modal>
    );
}
