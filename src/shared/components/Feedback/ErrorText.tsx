import { errorMessage } from "@/api/errors";
import { aboutRef, openContact, refIn, useContactHosted, whatsAppLink, type ContactAbout } from "@/app/contact/contact";
import { useBranding } from "@/shared/components/Identity/useBranding";

/**
 * An error's message. One that ends with a reference (an unexpected failure on the server) links to Contact the
 * developer, which arrives with that reference and the time it happened.
 */
export function ErrorText({ text }: { text: string }) {
    const ref = refIn(text);
    return (
        <>
            {text}
            {ref && <>{" "}<ContactLink about={() => aboutRef(ref)} /></>}
        </>
    );
}

/** The message for a failed request, with its Contact the developer link when it has a reference. */
export function ErrorMessage({ error }: { error: unknown }) {
    return <ErrorText text={errorMessage(error)} />;
}

/** Opens Contact the developer about an error; signed out (the sign-in pages), it is WhatsApp. */
export function ContactLink({ about }: { about: () => ContactAbout }) {
    return useContactHosted()
        ? <button type="button" className="link" onClick={() => openContact(about())}>Contact the developer</button>
        : <WhatsAppLink about={about} />;
}

function WhatsAppLink({ about }: { about: () => ContactAbout }) {
    const number = useBranding().data?.supportWhatsApp;
    if (!number) return null;
    const { ref, at, message } = about();
    const text = `Contact the developer (ID InDetails)\n\n${ref ? `Error ref ${ref}` : `The page failed: ${message}`}\nAt ${at}\nPage: ${window.location.pathname}`;
    return <a className="link" href={whatsAppLink(number, text)} target="_blank" rel="noreferrer">WhatsApp the developer</a>;
}
