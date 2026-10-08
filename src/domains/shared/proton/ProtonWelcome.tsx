import { useState } from "react";
import { Link } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { useProtonBriefing, type ProtonRef } from "./protonApi";
import { greetingFor, startersFor } from "./greeting";
import { useProtonPageContext } from "./useProtonPageContext";

type ProtonWelcomeProps = {
    onAsk: (question: string) => void;
    linkOf: (ref: ProtonRef) => string | null;
    disabled: boolean;
};

const AREAS: Record<string, string> = { design: "Design", execution: "Execution" };

/**
 * What an empty chat shows: Proton's hello, the few things most worth a look (from the briefing, no model call), and
 * questions to start with for this page. Nothing here is written by the model.
 */
export default function ProtonWelcome({ onAsk, linkOf, disabled }: ProtonWelcomeProps) {
    const user = useCurrentUser();
    const p = usePermissions();
    const page = useProtonPageContext();
    const briefing = useProtonBriefing();
    const [now] = useState(() => new Date());
    const items = briefing.data?.items ?? [];
    const more = briefing.data?.more ?? 0;
    const starters = startersFor(page, p);

    return (
        <div className="proton-turn proton">
            <div className="msg-bubble">
                <div className="msg-text">
                    {greetingFor(user.firstName, now)} {items.length > 0 ? "A few things you may want to look at:" : "What can I help you with?"}
                </div>
                {items.length > 0 && (
                    <ul className="proton-briefing">
                        {items.map((item, i) => {
                            const to = item.project ? linkOf(item.project) : null;
                            const name = item.project?.name ?? AREAS[item.domain ?? ""] ?? "Company";
                            return (
                                <li key={item.project ? `p${item.project.id}` : `d${i}`}>
                                    {to ? <Link to={to}>{name}</Link> : <strong>{name}</strong>}: {item.facts[0]}
                                    {item.facts.length > 1 && <span className="muted"> (and {item.facts.length - 1} more)</span>}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {more > 0 && <div className="muted proton-briefing-more">There {more === 1 ? "is 1 more" : `are ${more} more`}. Ask me what needs your attention.</div>}
            </div>
            {starters.length > 0 && (
                <div className="proton-choices" role="group" aria-label="Ways to start">
                    {starters.map((question) => (
                        <button key={question} className="btn btn-sm" disabled={disabled} onClick={() => onAsk(question)}>{question}</button>
                    ))}
                </div>
            )}
        </div>
    );
}
