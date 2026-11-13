import { useEffect } from "react";
import { errorMessage } from "@/api/errors";
import { registerOpener } from "@/shared/components/Overlays/assistantLayer";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { closeContact, hostContact, openContact, useContact, type ContactOpen } from "./contact";
import { useContactForm, type ContactSend } from "./contactApi";
import ContactFields from "./ContactFields";

/**
 * Shows the Contact the developer window wherever it is opened from, in the signed-in app or portal, and says the
 * window can open (an error's link offers it). In the app, Proton opens it too when asked.
 */
export default function ContactHost({ send, proton = false }: { send: ContactSend; proton?: boolean }) {
    const open = useContact();
    useEffect(() => hostContact(), []);
    useEffect(() => (proton ? registerOpener("report_bug", () => openContact()) : undefined), [proton]);
    return open ? <ContactModal key={open.n} open={open} send={send} /> : null;
}

function ContactModal({ open, send }: { open: ContactOpen; send: ContactSend }) {
    const form = useContactForm(open.about, open.page, send);
    return (
        <Modal surfaceId="report_bug" title="Contact the developer" sub="Tell the developer what happened, and they'll look into it." onClose={closeContact}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {form.sending.error ? <span className="err"><Icon name="alert" />{errorMessage(form.sending.error)}</span> : form.note}
                    </div>
                    <button className="btn" onClick={closeContact}>Cancel</button>
                    <button className="btn btn-primary" disabled={form.sending.isPending} onClick={() => form.submit(closeContact)}>
                        {form.sending.isPending ? "Sending…" : "Send"}
                    </button>
                </>
            }>
            <ContactFields form={form} autoFocus />
        </Modal>
    );
}
