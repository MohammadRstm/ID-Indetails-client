import { useEffect, useState } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import ProtonPanel from "./ProtonPanel";
import { loadChat, saveChat, type ProtonChat } from "./protonChat";

/**
 * The top bar's way into Proton. It keeps the conversation, so closing the panel and opening it again continues it,
 * and so does reloading the tab. The chat belongs to the person signed in: another person never sees it.
 */
export default function ProtonButton() {
    const { id: userId } = useCurrentUser();
    const [open, setOpen] = useState(false);
    const [kept, setKept] = useState(() => ({ userId, chat: loadChat(userId) }));
    // someone else signed in in this tab: start from their own chat
    const chat = kept.userId === userId ? kept.chat : loadChat(userId);

    useEffect(() => saveChat(kept.userId, kept.chat), [kept]);

    const change = (update: (chat: ProtonChat) => ProtonChat) =>
        setKept((k) => ({ userId, chat: update(k.userId === userId ? k.chat : loadChat(userId)) }));

    return (
        <>
            <button className={cx("icon-btn", open && "on")} onClick={() => setOpen(true)} aria-label="Ask Proton" title="Ask Proton">
                <Icon name="compass" />
            </button>
            {open && <ProtonPanel chat={chat} onChange={change} onClose={() => setOpen(false)} />}
        </>
    );
}
