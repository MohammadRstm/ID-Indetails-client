import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { refOf } from "@/api/errors";
import { http } from "@/api/http";
import { recentErrors } from "@/api/recentErrors";
import type { Schemas } from "@/api/types";
import { isStandalone } from "@/app/pwa/install";
import { fillEmpty, useProtonForm } from "@/domains/shared/proton/formFill";
import { toast } from "@/shared/components/Feedback/toast";
import { fmtDate, fmtTime } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import type { ContactAbout } from "./contact";

export type ContactMessage = Schemas["ReportBugRequest"];

/** Sends the message: staff to POST /api/bug-reports, a client in the portal to POST /api/portal/contact. */
export type ContactSend = (message: ContactMessage) => Promise<unknown>;

export const sendFromStaff: ContactSend = (message) => http.post("/bug-reports", message);

const MAX_TEXT = 4000;

/** What a message says about its error: "Error ref 4bf92f35 · Nov 13, 2:32 PM", or that the page failed. */
export function aboutLabel(about: ContactAbout): string {
    const when = `${fmtDate(about.at)}, ${fmtTime(about.at)}`;
    return about.ref ? `Error ref ${refOf(about.ref)} · ${when}` : `The page failed · ${when}`;
}

/**
 * The Contact the developer form: what they were trying to do and what happened, anything else, and the error it is
 * about (which they may take off). The API adds who sent it; the page goes as its path only, so no link token travels.
 */
export function useContactForm(about: ContactAbout | null, page: string, send: ContactSend) {
    const [description, setDescription] = useState("");
    const [details, setDetails] = useState("");
    const [error, setError] = useState(about);
    const proton = useProtonForm("report_bug", null, (fill) => {
        const v = fill.reportBug;
        const done: string[] = [];
        if (!v) return done;
        fillEmpty(description, v.description, setDescription, "description", done);
        fillEmpty(details, v.details, setDetails, "details", done);
        return done;
    });
    const errors = useFormErrors();
    const sending = useMutation({
        mutationFn: () => send({
            description: description.trim(),
            details: details.trim() || null,
            page,
            installedApp: isStandalone(),
            error,
            // the requests that failed lately here: their references find what happened in the API's log
            recentErrors: [...recentErrors()],
        }),
    });
    const descriptionError = !description.trim() ? "Say what you were trying to do, and what happened."
        : description.length > MAX_TEXT && `At most ${MAX_TEXT} characters.`;
    const detailsError = details.length > MAX_TEXT && `At most ${MAX_TEXT} characters.`;
    const errorLine = error && (error.ref ? `Error ref ${refOf(error.ref)}, at ${error.at}` : `The page failed: ${error.message}, at ${error.at}`);
    // whatever has been typed so far goes with a WhatsApp message, with the error and the page
    const whatsAppText = ["Contact the developer (ID InDetails)", description.trim(), details.trim(), errorLine, `Page: ${page}`]
        .filter(Boolean).join("\n\n");

    function submit(onSent: () => void) {
        if (sending.isPending) return;
        if (descriptionError || detailsError) return errors.tried();
        sending.mutate(undefined, {
            onSuccess: () => {
                toast({ text: "Thanks - your message was sent", sub: "A copy is on its way to your email.", icon: "checkCircle" });
                onSent();
            },
        });
    }

    return {
        description, setDescription, details, setDetails, error, dropError: () => setError(null),
        proton, errors, sending, descriptionError, detailsError, whatsAppText, submit,
        note: `Sent with this page's address, your browser and your name${recentErrors().length ? ", and the references of your last errors" : ""}.`,
    };
}

export type ContactForm = ReturnType<typeof useContactForm>;
