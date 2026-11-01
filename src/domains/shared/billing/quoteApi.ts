import { useMutation, useQuery } from "@tanstack/react-query";
import { downloadFile } from "@/api/download";
import { http } from "@/api/http";
import { useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Quote = Schemas["QuoteResponse"];

const quotesKey = (projectId: number) => ["quotes", projectId] as const;

/** The project's quotes, newest first (invoice:send). */
export function useQuotes(projectId: number, enabled = true) {
    return useQuery({
        queryKey: quotesKey(projectId),
        queryFn: async () => (await http.get<Quote[]>(`/projects/${projectId}/quotes`)).data,
        enabled,
    });
}

export type QuoteChannel = { channel: "email" | "whatsapp" | "download"; to: string | null };

/**
 * Makes a quote from the project's payment and TVA as they are now, and sends it: emailed by ID InDetails, or
 * recorded as shared on WhatsApp or downloaded (the PDF is fetched then).
 */
export function useSendQuote(projectId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ channel, to }: QuoteChannel) => {
            const quote = (await http.post<Quote>(`/projects/${projectId}/quotes`)).data;
            const sent = channel === "email"
                ? (await http.post<Quote>(`/quotes/${quote.id}/email`, { to })).data
                : (await http.post<Quote>(`/quotes/${quote.id}/deliveries`, { channel, recipient: to })).data;
            if (channel === "download") await downloadFile(`/quotes/${quote.id}/pdf`, `${quote.number.toLowerCase()}.pdf`);
            return sent;
        },
        onSuccess: () => { void invalidate(quotesKey(projectId)); },
    });
}
