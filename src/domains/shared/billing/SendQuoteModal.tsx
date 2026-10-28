import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useClient } from "../clients/clientsApi";
import type { Project } from "../projects/projectsApi";
import { channelsOf, waLink } from "./channels";
import { useSendQuote } from "./quoteApi";

/**
 * "Send the quote?" first: right after a project is created, or its payment or TVA changes, whoever sends quotes is
 * asked. Yes picks how it reaches the client (email, WhatsApp or a PDF to send yourself); the quote is made then, from
 * the payment and TVA as they are, and the client only ever sees its total.
 */
export default function SendQuoteModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const [asking, setAsking] = useState(true);
    const company = useCompanySettings().data;
    const client = useClient(project.client?.id ?? null).data;
    const send = useSendQuote(project.id);
    const channels = channelsOf(client?.contacts);
    const [pick, setPick] = useState<string | null>(null);
    const chosenKey = pick ?? channels[0]?.key ?? "download";
    const chosen = channels.find((c) => c.key === chosenKey) ?? null;
    const total = project.money ? money.exact(project.money.paymentWithTva) : null;
    const firstName = (client?.name ?? project.client?.displayName ?? "").split(" ")[0];
    const waText = (n: string) => `Hello ${firstName} - our quote ${n} for ${project.title} is ready${total ? `: ${total} for the project` : ""}. ${company?.name ?? ""}`.trim();

    if (asking) {
        return (
            <Modal size="sm" title="Send the quote?" sub={project.title} onClose={onClose}
                foot={
                    <>
                        <button className="btn" onClick={onClose}>Not now</button>
                        <button className="btn btn-primary" onClick={() => setAsking(false)}><Icon name="send" />Send the quote</button>
                    </>
                }>
                <p style={{ margin: 0 }}>
                    The quote tells {project.client?.displayName ?? "the client"} what the whole project costs them{total ? <>: <b>{total}</b></> : ""}, TVA included and never shown apart.
                    {project.domain === "execution" ? " Materials are billed separately, as they are delivered." : ""}
                </p>
            </Modal>
        );
    }

    function submit() {
        const tab = chosen?.channel === "whatsapp" ? window.open("", "_blank") : null;
        if (tab) tab.opener = null;
        send.mutate({ channel: chosen?.channel ?? "download", to: chosen?.value ?? null }, {
            onSuccess: (sent) => {
                if (chosen?.channel === "whatsapp" && tab) tab.location.href = waLink(chosen.value, waText(sent.number));
                toast({
                    text: `${sent.number}${chosen?.channel === "whatsapp" ? " shared on WhatsApp" : chosen ? ` emailed to ${chosen.value}` : " downloaded"}`,
                    sub: `${money.exact(sent.totalUsd)} for ${project.title}`,
                    icon: "send",
                });
                onClose();
            },
            onError: () => tab?.close(),
        });
    }

    return (
        <Modal size="md" onClose={send.isPending ? undefined : onClose} title="Send the quote" sub={`${project.client?.displayName ?? ""}${total ? ` · ${total}` : ""}`}
            foot={
                <>
                    <div className="grow">{send.error && <span className="err"><Icon name="alert" />{errorMessage(send.error)}</span>}</div>
                    <button className="btn" disabled={send.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={send.isPending} onClick={submit}>
                        <Icon name={chosen?.channel === "whatsapp" ? "send" : chosen ? "mail" : "download"} />
                        {send.isPending ? "Sending…" : chosen?.channel === "whatsapp" ? "Open WhatsApp" : chosen ? "Send email" : "Download"}
                    </button>
                </>
            }>
            <div className="u" style={{ marginBottom: 6 }}>How should it reach {firstName || "the client"}?</div>
            {client && channels.length === 0 && (
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow"><b>No email or WhatsApp number on file.</b> Add a contact to this client, or download the quote and send it yourself.</div>
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
        </Modal>
    );
}
