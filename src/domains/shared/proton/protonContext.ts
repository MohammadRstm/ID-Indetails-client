import { createContext, useContext } from "react";
import type { ProtonRef } from "./protonApi";
import type { ProtonConversation } from "./useProtonConversation";

/**
 * The one conversation with Proton, for the panel and the Proton page alike: a single instance, so an answer, Stop
 * and voice are never run twice. Null for someone without Proton.
 */
export type ProtonShared = {
    conversation: ProtonConversation;
    /** Where a record named in an answer opens, when this person may open it there. */
    linkOf: (ref: ProtonRef) => string | null;
};

export const ProtonContext = createContext<ProtonShared | null>(null);

export const useProtonShared = () => useContext(ProtonContext);

/** The Proton page's address in an area: `/design/assistant`, `/company/assistant`, and so on, with a chat's id. */
export const assistantPath = (area: string, chatId?: string | null) => `/${area}/assistant${chatId ? `/${chatId}` : ""}`;
