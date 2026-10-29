import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/*
 * Bills of quantities on Achrafieh Towers lobby (project 7, as the API answers them): the client BOQ BQ-2026-001
 * ("Lobby works", $17,000, agreed on 5 October, emailed on the 3rd), a second client draft BQ-2026-002 that was not
 * chosen, a VO for a fence, and two internal drafts, Karim's and Nadia's. The price is the one the lobby's project
 * carries: a work price of $17,000, supervision of 10% and no TVA.
 */

type Summary = Schemas["BoqSummaryResponse"];
type Detail = Schemas["BoqDetailResponse"];
type Line = Schemas["BoqLineResponse"];
type List = Schemas["BoqListResponse"];

const rana = { id: 1, name: "Rana Test" };
const karim = { id: 3, name: "Karim Test" };
const nadia = { id: 2, name: "Nadia Test" };

const line = (id: number, position: number, code: string | null, description: string, quantity: number, wasteRate: number, finalQuantity: number, unit: string | null, rate: number, totalUsd: number): Line =>
    ({ id, position, code, description, quantity, wasteRate, finalQuantity, unit, rate, totalUsd });

/** Three lines that make $17,000. */
const lobbyLines = (first: number): Line[] => [
    line(first, 1, "1.1", "Demolition", 100, 0.05, 105, "m²", 20, 2100),
    line(first + 1, 2, "2.1", "Porcelain tiles", 180, 0.1, 198, "m²", 30, 5940),
    line(first + 2, 3, "3.1", "Electrical first fix", 1, 0, 1, "lot", 8960, 8960),
];

const summary = (over: Partial<Summary>): Summary => ({
    id: 31, kind: "client", number: "BQ-2026-001", title: "Lobby works", author: rana, status: "draft", totalUsd: 17000, lineCount: 3, reason: null,
    createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-02T09:00:00Z", agreedAt: null, agreedBy: null, lastDelivery: null, ...over,
});

const agreedSummary = summary({ status: "agreed", agreedAt: "2026-10-05T09:00:00Z", agreedBy: rana, lastDelivery: { channel: "email", sentAt: "2026-10-03T09:00:00Z" } });
const optionB = summary({ id: 32, number: "BQ-2026-002", title: "Lobby works, option B" });
const fence = summary({ id: 41, kind: "vo", number: "VO-2026-001", title: "Fence", reason: "Fence along the north side", totalUsd: 6500, lineCount: 1 });
const mine = summary({ id: 51, kind: "internal", number: null, title: "Karim's quantities", author: karim, totalUsd: 16500 });
const theirs = summary({ id: 52, kind: "internal", number: null, title: "Nadia's quantities", author: nadia, totalUsd: 17500, lineCount: 1 });

/** A BOQ as the API answers it: its figures are the API's, so they are written out, not worked out here. */
const detail = (s: Summary, lines: Line[], figures: { supervisionUsd: number; clientTotalUsd: number }, over: Partial<Detail> = {}): Detail => ({
    ...s, projectId: 7, adjustmentType: "none", adjustmentValue: null, lines, subtotalUsd: s.totalUsd, adjustmentUsd: 0,
    supervisionRate: 0.1, supervisionUsd: figures.supervisionUsd, tvaRate: 0, tvaUsd: 0, clientTotalUsd: figures.clientTotalUsd,
    deliveries: [], ...over,
});

const price = (over: Partial<NonNullable<List["price"]>> = {}): NonNullable<List["price"]> => ({
    agreedBoqUsd: 17000, agreedVosUsd: 0, workUsd: 17000, supervisionRate: 0.1, supervisionUsd: 1700, tvaRate: 0, tvaUsd: 0, clientTotalUsd: 18700, ...over,
});

const agreed = detail(agreedSummary, lobbyLines(101), { supervisionUsd: 1700, clientTotalUsd: 18700 }, {
    deliveries: [{ id: 1, channel: "email", recipient: "fadi@achrafiehtowers.test", note: null, totalUsd: 17000, sentAt: "2026-10-03T09:00:00Z", sentBy: rana }],
});
const draftB = detail(optionB, lobbyLines(201), { supervisionUsd: 1700, clientTotalUsd: 18700 });
const vo = detail(fence, [line(301, 1, "V1", "Fence", 50, 0, 50, "m", 130, 6500)], { supervisionUsd: 650, clientTotalUsd: 7150 });
const draftMine = detail(mine, [line(401, 1, "1.1", "Demolition", 100, 0.05, 105, "m²", 20, 2100), line(402, 2, "2.1", "Porcelain tiles", 180, 0.1, 198, "m²", 30, 5940), line(403, 3, "3.1", "Electrical first fix", 1, 0, 1, "lot", 8460, 8460)],
    { supervisionUsd: 1650, clientTotalUsd: 18150 });
const draftTheirs = detail(theirs, [line(501, 1, "1", "All the works", 1, 0, 1, "lot", 17500, 17500)], { supervisionUsd: 1750, clientTotalUsd: 19250 });

export const boqs = {
    /** BQ-2026-001 is agreed: the other client draft is "not chosen", and a VO can be made. */
    list: { client: [agreedSummary, optionB], vos: [fence], internal: [mine, theirs], price: price() } as List,
    /** Nothing is agreed yet: two client drafts, no VO and no price. */
    unagreed: {
        client: [{ ...agreedSummary, status: "draft", agreedAt: null, agreedBy: null }, optionB], vos: [], internal: [mine, theirs],
        price: price({ agreedBoqUsd: 0, workUsd: 0, supervisionUsd: 0, clientTotalUsd: 0 }),
    } as List,
    price,
    /** Every BOQ in full, by id. */
    detail: { 31: agreed, 32: draftB, 41: vo, 51: draftMine, 52: draftTheirs } as Record<number, Detail>,
    agreed, draftB, vo, draftMine, draftTheirs, lobbyLines,
};

/** The summary of a BOQ, for the lists. */
export const summaryOf = (d: Detail): Summary => ({
    id: d.id, kind: d.kind, number: d.number, title: d.title, author: d.author, status: d.status, totalUsd: d.totalUsd, lineCount: d.lines.length, reason: d.reason,
    createdAt: d.createdAt, updatedAt: d.updatedAt, agreedAt: d.agreedAt, agreedBy: d.agreedBy, lastDelivery: d.lastDelivery,
});

export const boqHandlers = [
    http.get("/api/projects/:id/boqs", () => HttpResponse.json(boqs.list)),
    http.get("/api/boqs/:id", ({ params }) => {
        const found = boqs.detail[Number(params.id)];
        return found ? HttpResponse.json(found)
            : HttpResponse.json({ type: "not_found", code: "not_found", message: "That BOQ doesn't exist.", errors: null }, { status: 404 });
    }),
];
