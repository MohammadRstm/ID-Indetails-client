/** A way to reach a client: an email address, or a phone number on WhatsApp. */
export type Channel = { key: string; channel: "email" | "whatsapp"; value: string; label: string | null };

type Contact = { id: number; kind: string; value: string; label: string | null; isWhatsapp: boolean };

/** A client's email addresses and WhatsApp numbers, in the order they are listed. */
export function channelsOf(contacts: Contact[] | undefined): Channel[] {
    return (contacts ?? []).flatMap((c): Channel[] =>
        c.kind === "email" ? [{ key: `email:${c.id}`, channel: "email", value: c.value, label: c.label }]
            : c.kind === "phone" && c.isWhatsapp ? [{ key: `whatsapp:${c.id}`, channel: "whatsapp", value: c.value, label: c.label }] : []);
}

/** "wa.me/96170123456?text=…": opens the chat with the message ready. */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;
