import { useState } from "react";
import { useLocation } from "react-router";
import { errorMessage } from "@/api/errors";
import ContactFields from "@/app/contact/ContactFields";
import { sendFromStaff, useContactForm } from "@/app/contact/contactApi";
import Icon from "@/shared/icons/Icon";

/** Settings → Contact: a message to the developer, by email or WhatsApp, for everyone signed in. */
export default function ContactSection() {
    // a sent message leaves an empty form for the next one
    const [sent, setSent] = useState(0);
    return <ContactPanel key={sent} onSent={() => setSent((n) => n + 1)} />;
}

function ContactPanel({ onSent }: { onSent: () => void }) {
    const { pathname } = useLocation();
    const form = useContactForm(null, pathname, sendFromStaff);
    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Contact the developer</div>
                    <div className="panel-sub">Something not working, or an idea? Write to the developer here, or message them on WhatsApp.</div>
                </div>
            </div>
            <div className="panel-body">
                <ContactFields form={form} />
                <div className="row" style={{ gap: 10, marginTop: 14 }}>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {form.sending.error ? <span className="err"><Icon name="alert" />{errorMessage(form.sending.error)}</span> : form.note}
                    </div>
                    <button className="btn btn-primary" disabled={form.sending.isPending} onClick={() => form.submit(onSent)}>
                        {form.sending.isPending ? "Sending…" : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}
