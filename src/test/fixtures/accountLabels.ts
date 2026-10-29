import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/** The company's account labels a payment or an expense is filed under (the seeded three). */
export const accountLabels = [
    { id: 1, name: "Concrete", position: 1, archived: false },
    { id: 2, name: "Finishing", position: 2, archived: false },
    { id: 3, name: "Permits", position: 3, archived: false },
] as Schemas["AccountLabelResponse"][];

/** What every screen with a label select asks for. */
export const accountLabelsHandler = http.get("/api/account-labels", () => HttpResponse.json(accountLabels));
