import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { useForgetMemory, useProtonMemories } from "./protonApi";

/**
 * What Proton remembers for the person between chats, in their own words, each with Forget. Things are added only
 * from their own messages ("Remember this" under a message they typed).
 */
export default function ProtonMemories({ onBack }: { onBack: () => void }) {
    const memories = useProtonMemories();
    const forget = useForgetMemory();

    return (
        <div className="proton-memories">
            <div className="proton-memories-head">
                <b>What I remember</b>
                <button className="btn btn-sm btn-quiet" onClick={onBack}>Back to the chat</button>
            </div>
            <p className="muted">Things you asked me to remember, in your words. I use them only for how I answer you.</p>
            {loadFailed(memories) ? <LoadError error={memories.error} retry={() => memories.refetch()} what="what I remember" />
                : !memories.data ? <SkeletonLines lines={3} />
                : memories.data.length === 0 ? <p className="muted">Nothing yet. Under a message you sent me, choose "Remember this".</p>
                : (
                    <ul className="proton-memory-list">
                        {memories.data.map((m) => (
                            <li key={m.id}>
                                <span dir="auto">{m.text}</span>
                                <button className="btn btn-sm btn-quiet" disabled={forget.isPending} onClick={() => forget.mutate(m.id)}
                                    aria-label={`Forget "${m.text}"`}>
                                    Forget
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            {forget.error && <p className="err" role="alert">{errorMessage(forget.error)}</p>}
        </div>
    );
}
