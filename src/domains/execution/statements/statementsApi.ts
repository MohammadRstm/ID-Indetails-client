import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type Statement = Schemas["StatementResponse"];
export type StatementSummary = Schemas["StatementSummaryResponse"];
export type StatementChoice = Schemas["CreateStatementRequest"];

/** Under the project, so a change to its materials or payments refreshes them. */
const statementsKey = (projectId: number) => [...keys.projects.detail(projectId), "statements"] as const;

/** A site's statements, newest first (statement:create, statement:send or financial:view). */
export function useStatements(projectId: number, page: number, enabled: boolean) {
    return useQuery({
        queryKey: [...statementsKey(projectId), "list", page],
        queryFn: async () => (await http.get<Paged<StatementSummary>>(`/projects/${projectId}/statements`, { params: { page, pageSize: 10 } })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** A statement as it was made: the figures of its day. */
export function useStatement(projectId: number, id: number | null) {
    return useQuery({
        queryKey: [...statementsKey(projectId), "detail", id],
        queryFn: async () => (await http.get<Statement>(`/statements/${id}`)).data,
        enabled: id != null,
    });
}

/** The statement as it would be made now, with a provisional number; nothing is saved (statement:create). */
export function useStatementPreview(projectId: number, choice: StatementChoice, enabled: boolean) {
    return useQuery({
        queryKey: [...statementsKey(projectId), "preview", choice],
        queryFn: async () => (await http.post<Statement>(`/projects/${projectId}/statements/preview`, choice)).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Everything a statement moves: its site's statements, and the prices it freezes on the materials. */
function useRefresh() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.activity.all); };
}

/** Numbers the statement and freezes the price of every material it shows (statement:create). */
export function useCreateStatement(projectId: number) {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async (choice: StatementChoice) => (await http.post<Statement>(`/projects/${projectId}/statements`, choice)).data,
        onSuccess: refresh,
    });
}

/** Records that it went out: on WhatsApp, or as a PDF sent some other way (statement:send). */
export function useRecordStatementDelivery() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Schemas["RecordDeliveryRequest"] }) =>
            (await http.post<Statement>(`/statements/${id}/deliveries`, body)).data,
        onSuccess: refresh,
    });
}

/** Emails it to the client with the PDF attached, and records the delivery (statement:send). */
export function useEmailStatement() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async ({ id, to }: { id: number; to: string }) => (await http.post<Statement>(`/statements/${id}/email`, { to })).data,
        onSuccess: refresh,
    });
}
