import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import ContextMenu from "@/shared/components/Overlays/ContextMenu";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
import { cx } from "@/shared/utils/cx";
import { AuthorLine } from "./DiscussionBits";
import type { DiscussionPerson } from "./discussionTypes";

/** One thing the menu of your own message or comment does: Edit, Delete. */
export type RowAction = { label: string; icon: IconName; onSelect: () => void; danger?: boolean };

type Props = {
    author: DiscussionPerson;
    createdAt: string;
    editedAt: string | null;
    /** The menu's name, and its "…" button's: "Message actions". */
    menuLabel: string;
    /** Your own, while it can still be changed. Without any (someone else's, a deleted one, a closed project) there is no menu. */
    actions: RowAction[];
    /** "gone" for a deleted one. */
    className?: string;
    /** Above the bubble, such as the version of the file a comment was written about. */
    note?: ReactNode;
    /** The box it is being edited in, in the bubble's place. */
    editor?: ReactNode;
    /** Under the bubble, such as the question before deleting it. */
    after?: ReactNode;
    /** What the bubble says. */
    children: ReactNode;
};

/** How long a finger holds a bubble before its menu opens. */
const LONG_PRESS_MS = 500;
/** How far the finger may wander and still be holding. */
const SLOP_PX = 10;
/** The menu's width, to open it leftwards from the "…" of your own (on the right). */
const MENU_W = 220;

/**
 * A chat message or a comment as a bubble: your own on the right, everyone else's on the left with who wrote it and
 * when above it. Your own have a small menu (Edit, Delete): a right-click on it, a long press on a touch screen, or the
 * "…" button beside it, which shows on hover and when it has the keyboard. Escape and a click outside close the menu.
 */
export default function BubbleRow({ author, createdAt, editedAt, menuLabel, actions, className, note, editor, after, children }: Props) {
    const mine = author.isYou;
    const hasMenu = actions.length > 0 && editor == null;
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const more = useRef<HTMLButtonElement>(null);
    const press = useRef<{ x: number; y: number; timer: number } | null>(null);
    // a hold opened the menu: the finger coming up mustn't click as well
    const held = useRef(false);

    function cancelPress() {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
    }

    function onContextMenu(e: MouseEvent<HTMLLIElement>) {
        // someone else's keeps the browser's own menu
        if (!hasMenu) return;
        e.preventDefault();
        cancelPress();
        setMenu({ x: e.clientX, y: e.clientY });
    }

    function onPointerDown(e: PointerEvent<HTMLLIElement>) {
        if (!hasMenu || e.pointerType !== "touch") return;
        cancelPress();
        held.current = false;
        const { clientX: x, clientY: y } = e;
        const timer = window.setTimeout(() => {
            press.current = null;
            held.current = true;
            setMenu({ x, y });
        }, LONG_PRESS_MS);
        press.current = { x, y, timer };
    }

    function onPointerMove(e: PointerEvent<HTMLLIElement>) {
        const start = press.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) cancelPress();
    }

    function onTouchEnd(e: TouchEvent<HTMLLIElement>) {
        if (!held.current) return;
        held.current = false;
        e.preventDefault();
    }

    function openFromButton() {
        const box = more.current?.getBoundingClientRect();
        if (!box) return;
        setMenu({ x: mine ? box.right - MENU_W : box.left, y: box.bottom + 4 });
    }

    // Escape, or a click outside: the keyboard goes back to the "…", unless the click gave it to something else
    function closeMenu() {
        setMenu(null);
        setTimeout(() => {
            if (document.activeElement == null || document.activeElement === document.body) more.current?.focus({ preventScroll: true });
        });
    }

    function choose(action: RowAction) {
        setMenu(null);
        action.onSelect();
    }

    return (
        <li className={cx("dp-msg dp-row", mine && "mine", hasMenu && "has-menu", editor != null && "editing", className)}
            onContextMenu={onContextMenu} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={cancelPress}
            onPointerCancel={cancelPress} onTouchEnd={onTouchEnd}>
            <AuthorLine author={author} createdAt={createdAt} editedAt={editedAt} />
            {note}
            {editor ?? (
                <div className="dp-bubble-line">
                    <div className="dp-bubble">{children}</div>
                    {hasMenu && (
                        <button ref={more} type="button" className="icon-btn dp-more" aria-label={menuLabel} aria-haspopup="menu"
                            aria-expanded={menu != null} onClick={openFromButton}>
                            <Icon name="dots" />
                        </button>
                    )}
                </div>
            )}
            {after}
            {menu && hasMenu && (
                <ContextMenu x={menu.x} y={menu.y} label={menuLabel} onClose={closeMenu}>
                    {actions.map((action) => (
                        <button key={action.label} type="button" role="menuitem" className={cx("pop-item", action.danger && "danger")}
                            onKeyDown={moveAlong} onClick={() => choose(action)}>
                            <Icon name={action.icon} />{action.label}
                        </button>
                    ))}
                </ContextMenu>
            )}
        </li>
    );
}

/** The arrow keys, Home and End move between the menu's items. */
function moveAlong(e: KeyboardEvent<HTMLButtonElement>) {
    const items = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = items.indexOf(e.currentTarget);
    const to = e.key === "ArrowDown" ? (at + 1) % items.length
        : e.key === "ArrowUp" ? (at - 1 + items.length) % items.length
            : e.key === "Home" ? 0
                : e.key === "End" ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus();
}
