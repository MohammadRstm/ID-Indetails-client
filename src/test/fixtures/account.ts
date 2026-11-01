import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/*
 * The account of Achrafieh Towers lobby (project 7) as the API works it out, to match the rest of its fixtures: a work
 * price of $17,000 with 10% supervision and no TVA, $10,000 received, $9,036 spent on site and $500 of the supervision
 * taken in two withdrawals. Nothing is filed under a label, so the single row is the unlabelled one.
 */

export const accountFigures: Schemas["AccountFiguresResponse"] = {
    workUsd: 17000,
    supervisionRate: 0.1,
    supervisionUsd: 1700,
    tvaRate: 0,
    tvaUsd: 0,
    clientTotalUsd: 18700,
    receivedUsd: 10000,
    restToPayUsd: 8700,
    costs: { siteExpensesUsd: 6036, groundLabourUsd: 3000, staffUsd: 0, otherUsd: 0, totalUsd: 9036 },
    profitUsd: 9664,
    supervision: { dueUsd: 1700, takenUsd: 500, leftUsd: 1200 },
    pocket: { movedToPocketUsd: 0, paidByPocketUsd: 0 },
    cashInAccountUsd: 464,
    byLabel: [{ accountLabel: null, receivedUsd: 10000, spentUsd: 9036, otherUsd: 500, restUsd: 464 }],
    byCategory: [{ category: "materials", spentUsd: 6036 }],
    // each payee's split: what was spent with them under each category and label (all materials, none labelled)
    byPayee: [
        { payee: "Tile House", spentUsd: 3960 }, { payee: "Steel Co", spentUsd: 936 },
        { payee: "Sipes", spentUsd: 840 }, { payee: "Holcim", spentUsd: 300 },
    ].map((p) => ({ ...p, splits: [{ category: "materials" as const, accountLabelId: null, spentUsd: p.spentUsd }] })),
    unconverted: [],
};

export const supervisionWithdrawals: Schemas["SupervisionWithdrawalResponse"][] = [
    { id: 2, amountUsd: 200, takenOn: "2026-09-25", note: "Second instalment", createdBy: { id: 10, name: "Karim Jaber" }, createdAt: "2026-09-25T10:00:00Z" },
    { id: 1, amountUsd: 300, takenOn: "2026-09-20", note: null, createdBy: { id: 10, name: "Karim Jaber" }, createdAt: "2026-09-20T10:00:00Z" },
];

/** What a site's Financials tab asks for: the account, and the supervision taken out of it. */
export const accountHandlers = [
    http.get("/api/projects/:id/account-figures", () => HttpResponse.json(accountFigures)),
    http.get("/api/projects/:id/supervision-withdrawals", () => HttpResponse.json(supervisionWithdrawals)),
];
