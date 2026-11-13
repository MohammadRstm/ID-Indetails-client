import { FieldError } from "@/shared/components/Forms/Field";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { whatsAppLink } from "./contact";
import { aboutLabel, type ContactForm } from "./contactApi";

/** The Contact the developer form's fields, the error it is about, and the WhatsApp way, in the window or in Settings. */
export default function ContactFields({ form, autoFocus = false }: { form: ContactForm; autoFocus?: boolean }) {
    const number = useBranding().data?.supportWhatsApp;
    const { errors } = form;
    return (
        <div {...form.proton.guard}>
            <FilledNote fields={form.proton.filled} />
            {form.error && (
                <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                    <span className="chip" title="Its reference finds what happened in the server's log">
                        <Icon name="alert" />{aboutLabel(form.error)}
                    </span>
                    <button type="button" className="link" onClick={form.dropError}>Leave it out</button>
                </div>
            )}
            <div className="field">
                <label className="label required" htmlFor="contact-description">What were you trying to do, and what happened?</label>
                <textarea id="contact-description" className="textarea" rows={4} autoFocus={autoFocus} placeholder="e.g. I tried to save an entry and it said something went wrong"
                    value={form.description} onChange={(e) => form.setDescription(e.target.value)} onBlur={errors.touch("description")} />
                <FieldError message={errors.show("description", form.descriptionError)} />
            </div>
            <div className="field">
                <label className="label optional" htmlFor="contact-details">Anything else that helps</label>
                <textarea id="contact-details" className="textarea" rows={3} placeholder="What you expected instead, how to make it happen again, an idea…"
                    value={form.details} onChange={(e) => form.setDetails(e.target.value)} onBlur={errors.touch("details")} />
                <FieldError message={errors.show("details", form.detailsError)} />
                <div className="hint">Please leave out passwords and other private details. Replies come to your email.</div>
            </div>
            {number && (
                <div className="bug-direct">
                    <div>
                        <div className="strong">Prefer WhatsApp?</div>
                        <div className="hint">Anything you've typed above goes with it.</div>
                    </div>
                    <a className="btn btn-sm" href={whatsAppLink(number, form.whatsAppText)} target="_blank" rel="noreferrer">
                        <Icon name="chat" />WhatsApp
                    </a>
                </div>
            )}
        </div>
    );
}
