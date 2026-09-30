import { useNavigate } from "react-router";
import { useDomain } from "@/app/routing/domainContext";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import type { ClientContact } from "./clientsApi";

export type ClientRef = { id: number; displayName: string; secondary?: string | null };

/** A client's initial in a square (the prototype's .client-mark). */
export function ClientMark({ name, large }: { name: string; large?: boolean }) {
    return <span className={large ? "client-mark lg" : "client-mark"}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

type ClientBadgeProps = {
    client: ClientRef | null | undefined;
    /** false shows only the name. */
    sub?: boolean;
    strong?: boolean;
    /** false keeps it from opening the client. */
    link?: boolean;
};

/** A client's mark and name, opening the client; "Internal" for a project without one (the prototype's UI.ClientBadge). */
export function ClientBadge({ client, sub = true, strong = true, link = true }: ClientBadgeProps) {
    const navigate = useNavigate();
    const domain = useDomain();
    if (!client) return <span className="badge" title="No client - internal project">Internal</span>;
    const inner = (
        <span className="pname" style={{ gap: 8 }}>
            <ClientMark name={client.displayName} />
            <span style={{ minWidth: 0 }}>
                <span className="trunc" style={{ fontWeight: strong ? 600 : 500, display: "block" }}>{client.displayName}</span>
                {sub && client.secondary && <span className="muted trunc" style={{ fontSize: 11, display: "block" }}>{client.secondary}</span>}
            </span>
        </span>
    );
    if (!link) return inner;
    return (
        <span className="client-link" onClick={(e) => { e.stopPropagation(); navigate(`/${domain}/clients/${client.id}`); }}>
            {inner}
        </span>
    );
}

const contactHref = (c: ClientContact) => (c.kind === "email" ? `mailto:${c.value}` : `tel:${c.value.replace(/[^0-9+]/g, "")}`);
const whatsappHref = (c: ClientContact) => `https://wa.me/${c.value.replace(/[^0-9]/g, "")}`;

function copy(value: string) {
    navigator.clipboard?.writeText(value).then(
        () => toast({ text: "Copied", sub: value, icon: "check" }),
        () => toast({ text: value, sub: "Copy it by hand - the browser blocked the clipboard", icon: "info" }),
    );
}

/** One way to reach a client, with email, call, WhatsApp and copy (the prototype's UI.ContactRow). */
export function ContactRow({ contact }: { contact: ClientContact }) {
    const email = contact.kind === "email";
    return (
        <div className="contact-row">
            <span className="feed-ic"><Icon name={email ? "mail" : "phone"} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="trunc" style={{ fontWeight: 600, fontSize: "12.5px" }}>{contact.value}</div>
                <div className="muted" style={{ fontSize: 11 }}>{contact.label || (email ? "Email" : "Phone")}{contact.isPrimary ? " · primary" : ""}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
                <a className="btn btn-sm" href={contactHref(contact)} target="_blank" rel="noopener noreferrer">
                    <Icon name={email ? "mail" : "phone"} />{email ? "Email" : "Call"}
                </a>
                {!email && contact.isWhatsapp && (
                    <a className="btn btn-sm" href={whatsappHref(contact)} target="_blank" rel="noopener noreferrer"><Icon name="send" />WhatsApp</a>
                )}
                <button className="icon-btn" aria-label="Copy" onClick={() => copy(contact.value)}><Icon name="file" /></button>
            </div>
        </div>
    );
}
