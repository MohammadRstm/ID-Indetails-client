import type { OverheadGroup } from "./companyApi";

/** How the ledger groups its lines; only for reading it, never to split the cost. */
export const GROUP_LABEL: Record<OverheadGroup, string> = { software: "Software & services", operating: "Operating costs" };
