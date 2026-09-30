import { useState } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { useCurrentUser } from "@/app/session/useSession";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { addDays, companyToday, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useClient } from "../clients/clientsApi";
import { useSendInvoice, type Invoice } from "./billingApi";

type Channel = { key: string; channel: "email" | "whatsapp"; value: string; label: string | null };

/** "wa.me/96170123456?text=…": opens the chat with the message ready. */
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;

/**
 * Sending an invoice (the prototype's P.SendModal): by email, which Hourline sends with the PDF attached,
 * on WhatsApp, which opens the chat with the message ready, or as a PDF the admin sends themselves. A
 * draft is issued on the way, which numbers it and starts the payment clock.
 */
export default function SendInvoiceModal({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
    const me = useCurrentUser();
    const company = useCompanySettings().data;
    const client = useClient(inv.client.id).data;
    const send = useSendInvoice();
    const channels: Channel[] = (client?.contacts ?? []).flatMap((c): Channel[] =>
        c.kind === "email" ? [{ key: `email:${c.id}`, channel: "email", value: c.value, label: c.label }]
            : c.kind === "phone" && c.isWhatsapp ? [{ key: `whatsapp:${c.id}`, channel: "whatsapp", value: c.value, label: c.label }] : []);
    const [pick, setPick] = useState<string | null>(null);
    const chosenKey = pick ?? channels[0]?.key ?? "download";
    const chosen = channels.find((c) => c.key === chosenKey) ?? null;
    const first = !inv.issuedAt;
    const firstName = (inv.billToName ?? inv.client.displayName).split(" ")[0];
    const number = inv.number ?? "(numbered when sent)";
    const amount = money.exact(inv.balance ?? inv.total);
    const dueOn = inv.dueOn ?? (inv.termsDays > 0 ? addDays(companyToday(), inv.termsDays) : null);
    const due = dueOn ? `due by ${fmtDateY(dueOn)}` : "due on receipt";
    const waText = (n: string) => `Hello ${firstName} - invoice ${n} for ${inv.project.title} is ready: ${amount}, ${due}. ${company?.name ?? ""}`.trim();
    const sender = `${me.firstName} ${me.lastName}`.trim() || me.email;

    function submit() {
        // the chat opens in a tab of its own; it is opened now, while the click still allows it, and pointed at
        // WhatsApp once the invoice has its number
        const tab = chosen?.channel === "whatsapp" ? window.open("", "_blank") : null;
        if (tab) tab.opener = null;
        send.mutate({ invoice: inv, channel: chosen?.channel ?? "download", to: chosen?.value ?? null }, {
            onSuccess: async (sent) => {
                const n = sent.number ?? number;
                if (chosen?.channel === "whatsapp" && tab) tab.location.href = waLink(chosen.value, waText(n));
                if (!chosen) {
                    try {
                        await downloadFile(`/invoices/${sent.id}/pdf`, `${n.toLowerCase()}.pdf`);
                    } catch (e) {
                        toast({ text: "The PDF wasn't downloaded", sub: errorMessage(e), icon: "alert" });
                    }
                }
                toast({
                    text: `${n}${chosen?.channel === "whatsapp" ? " shared on WhatsApp" : chosen ? ` emailed to ${chosen.value}` : " downloaded"}`,
                    sub: `Recorded as sent · ${money.exact(sent.total)} now counts as invoiced, not as revenue`,
                    icon: "send",
                });
                onClose();
            },
            onError: () => tab?.close(),
        });
    }

    return (
        <Modal size="md" onClose={onClose} title={`Send ${inv.number ?? "invoice"}`} sub={`${inv.client.displayName} · ${money.exact(inv.total)}`}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: "11.5px" }}>
                        {send.error ? <span className="err"><Icon name="alert" />{errorMessage(send.error)}</span>
                            : first ? "Sending issues the invoice and starts the payment clock." : "Already sent - this records another delivery."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={send.isPending} onClick={submit}>
                        <Icon name={chosen?.channel === "whatsapp" ? "send" : chosen ? "mail" : "download"} />
                        {send.isPending ? "Sending…" : chosen?.channel === "whatsapp" ? "Open WhatsApp" : chosen ? "Send email" : "Download"}
                    </button>
                </>
            }>
            <div className="u" style={{ marginBottom: 6 }}>How should it reach {firstName}?</div>
            {client && channels.length === 0 && (
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow"><b>No email or WhatsApp number on file.</b> Add a contact to this client, or download the invoice and send it yourself.</div>
                </div>
            )}
            {channels.map((c) => (
                <button key={c.key} className={cx("pick-row", chosenKey === c.key && "on")} onClick={() => setPick(c.key)}>
                    <span className="feed-ic"><Icon name={c.channel === "email" ? "mail" : "send"} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "12.5px" }}>{c.channel === "email" ? "Email" : "WhatsApp"}</div>
                        <div className="muted trunc" style={{ fontSize: "11.5px" }}>{c.value}{c.label ? ` · ${c.label}` : ""}</div>
                    </div>
                    {chosenKey === c.key && <Icon name="check" />}
                </button>
            ))}
            <button className={cx("pick-row", chosenKey === "download" && "on")} onClick={() => setPick("download")}>
                <span className="feed-ic"><Icon name="download" /></span>
                <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: "12.5px" }}>Download the PDF</div>
                    <div className="muted" style={{ fontSize: "11.5px" }}>Send it yourself and record it as sent</div>
                </div>
                {chosenKey === "download" && <Icon name="check" />}
            </button>

            {chosen?.channel === "email" && (
                <div className="mt">
                    <div className="u" style={{ marginBottom: 4 }}>What they receive</div>
                    <div className="mail-preview">
                        <div className="mail-row"><span>To</span><b>{chosen.value}</b></div>
                        <div className="mail-row"><span>Subject</span><b>Invoice {number} - {inv.project.title}</b></div>
                        <p>Hello {inv.billToName ?? inv.client.displayName},</p>
                        <p>Please find invoice <b>{number}</b> for <b>{inv.project.title}</b> attached: {amount}, {due}.</p>
                        <p>Bank details are on the invoice. Thank you.<br />{sender} · {company?.name ?? ""}</p>
                    </div>
                </div>
            )}
            {chosen?.channel === "whatsapp" && (
                <div className="mt">
                    <div className="u" style={{ marginBottom: 4 }}>What gets sent</div>
                    <div className="wa-preview">{waText(number)}</div>
                </div>
            )}

            <div className="alloc-total mt">
                <Icon name="info" />
                <div className="grow">
                    <b>How it is sent</b>
                    <div className="muted" style={{ fontSize: "11.5px" }}>
                        Email goes out from Hourline with the invoice attached as a PDF. The WhatsApp link opens the chat with the message ready,
                        and you send it from your own account. Either way, Hourline records who it went to and when.
                    </div>
                </div>
            </div>
        </Modal>
    );
}
