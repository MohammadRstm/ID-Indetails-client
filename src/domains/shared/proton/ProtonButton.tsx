import { useState } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import ProtonPanel from "./ProtonPanel";
import { emptyChat, type ProtonChat } from "./protonChat";

/** The top bar's way into Proton. It keeps the conversation, so closing the panel and opening it again continues it. */
export default function ProtonButton() {
    const [open, setOpen] = useState(false);
    const [chat, setChat] = useState<ProtonChat>(emptyChat);

    return (
        <>
            <button className={cx("icon-btn", open && "on")} onClick={() => setOpen(true)} aria-label="Ask Proton" title="Ask Proton">
                <Icon name="compass" />
            </button>
            {open && <ProtonPanel chat={chat} onChange={setChat} onClose={() => setOpen(false)} />}
        </>
    );
}
