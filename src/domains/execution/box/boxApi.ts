import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import type { BoxChoice, Project } from "../../shared/projects/projectsApi";

export type Box = Schemas["BoxResponse"];
export type BoxProject = Schemas["BoxProjectResponse"];
export type BoxEntry = Schemas["BoxEntryResponse"];
export type BoxEntryKind = Schemas["BoxEntryKind"];

/** What a transfer's note may hold, as the API keeps it (BoxRules.MaxNoteLength). */
export const BOX_NOTE_MAX = 500;

/** The Execution box: its balance, who put money in, who is in the red and who waits for a decision. */
export function useBox() {
    return useQuery({ queryKey: keys.box.summary(), queryFn: async () => (await http.get<Box>("/execution/box")).data });
}

/** The box's movements, newest first. */
export function useBoxEntries(page: number, pageSize = 20) {
    const params = { page, pageSize };
    return useQuery({
        queryKey: keys.box.entries(params),
        queryFn: async () => (await http.get<Paged<BoxEntry>>("/execution/box/entries", { params })).data,
        placeholderData: keepPreviousData,
    });
}

function useBoxChange<T>(send: (body: T) => Promise<Box>) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: send,
        // a project's cash profit and box state change with it
        onSuccess: () => { void invalidate(keys.box.all, keys.projects.all, keys.finance.all); },
    });
}

/** Moves money to a project in the red. */
export function useMoveMoney() {
    return useBoxChange(async (body: { projectId: number; amount: number; note?: string }) => (await http.post<Box>("/execution/box/transfers", body)).data);
}

/** Removes or keeps the money of a project closed by someone who can't see money. */
export function useDecideBox() {
    return useBoxChange(async ({ projectId, decision }: { projectId: number; decision: "remove" | "keep" }) =>
        (await http.post<Box>(`/execution/box/projects/${projectId}/decision`, { decision })).data);
}

/** How the transactions table names each movement. */
export const BOX_ENTRY_LABEL: Record<BoxEntryKind, string> = {
    payment_in: "Client payment",
    payment_voided: "Payment voided",
    transfer: "Moved to project",
    removed: "Revenue removed",
    readded: "Revenue put back",
};

export type BoxOption = { value: BoxChoice; title: string; text: string };

/** The choices for a closing project's money, removal first: recommended. */
export function closeOptions(project: Project): BoxOption[] {
    const received = project.money?.billing.received;
    return [
        { value: "remove", title: "Remove its revenue from the box (recommended)", text: `What its client paid${received != null ? ` (${money.exact(received)})` : ""} leaves the box, so other sites can't use it.` },
        { value: "keep", title: "Keep it in the box", text: "Its revenue stays for sites in the red, and any late payment joins it." },
    ];
}

export const REOPEN_OPTIONS: BoxOption[] = [
    { value: "readd", title: "Put back its earlier revenue", text: "What was removed when it closed goes back into the box." },
    { value: "fresh", title: "Count afresh from today", text: "Only payments from now on go into the box." },
];
