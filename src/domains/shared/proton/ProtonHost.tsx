import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import BlobFigure from "./blob/BlobFigure";
import { clearOf, loadPrefs, placeOf, savePrefs, snapOf, type BlobPrefs, type Box } from "./blob/blobPosition";
import { moodName, moodOf, STILL_LOOKING_AFTER_MS, WORKING_AFTER_MS } from "./blob/protonMood";
import { useBlobDrag } from "./blob/useBlobDrag";
import ProtonPanel, { type PanelLayout } from "./ProtonPanel";
import { useProtonUsage, type ProtonUsage } from "./protonApi";
import { closeProton, dismissPeek, openProton, startFor, useProton, type ProtonState } from "./protonStore";
import { useProtonConversation } from "./useProtonConversation";

const BLOB = 64;
const PHONE = 640;
const PEEK_MS = 6_000;
/** What the blob keeps clear of besides the focused field: a dialog's buttons and the message composer. */
const OBSTACLES = ".scrim .modal-foot, .msg-composer-wrap";

/**
 * Proton on every signed-in screen of the people who have it: a blob that can be moved to either edge, and its chat.
 * Mounted once, beside the pages, so a reply still arrives after the panel closes or the person moves on.
 */
export default function ProtonHost() {
    const permissions = usePermissions();
    return permissions.has(P.PROTON_USE) ? <ProtonDock /> : null;
}

/** Switched on, even if this month's budget or allowance is used up (then it sleeps). */
const switchedOn = (usage: ProtonUsage) => usage.available || usage.companyLimitReached || usage.questionsRemaining === 0;

function ProtonDock() {
    const user = useCurrentUser();
    const proton = useProton();
    const usage = useProtonUsage().data;
    const conversation = useProtonConversation();
    const reduced = useReducedMotion();
    const viewport = useViewport();
    const [prefs, setPrefs] = useState(loadPrefs);
    const [composing, setComposing] = useState(false);
    const [unfoldedFor, setUnfoldedFor] = useState(proton.navigations);
    const blob = useRef<HTMLButtonElement>(null);
    const now = useMoodClock(proton);

    const change = (next: Partial<BlobPrefs>) => setPrefs((current) => {
        const merged = { ...current, ...next };
        savePrefs(merged);
        return merged;
    });
    const open = () => {
        if (prefs.tucked) change({ tucked: false });
        setUnfoldedFor(proton.navigations);
        openProton();
    };
    const close = () => {
        closeProton();
        blob.current?.focus();
    };
    const place = placeOf(prefs, viewport, BLOB);
    const drag = useBlobDrag(place, BLOB, (x, y) => change(snapOf(x, y, viewport, BLOB)), () => (proton.open ? close() : open()));
    const clearY = useKeepClear({ x: place.x, y: place.y, width: BLOB, height: BLOB }, viewport.height);

    useEffect(() => startFor(user.id), [user.id]);

    useEffect(() => {
        if (!proton.peek) return;
        const id = setTimeout(dismissPeek, PEEK_MS);
        return () => clearTimeout(id);
    }, [proton.peek]);

    if (!usage || !switchedOn(usage) || proton.userId !== user.id) return null;

    const newest = proton.chat.turns.findLast((t) => t.from === "proton" && t.action != null);
    const card = newest?.from === "proton" ? newest.action : null;
    const cardOpen = card != null && (proton.chat.actions[card.id]?.kind ?? "open") === "open" && Date.parse(card.expiresAt) > now;
    const mood = moodOf({
        available: usage.available,
        askedAt: proton.askedAt,
        talkingUntil: proton.saying?.until ?? 0,
        errorUntil: proton.errorUntil,
        happyUntil: proton.happyUntil,
        cardOpen,
        composing,
    }, now);
    const still = reduced || prefs.calm;
    const at = drag.dragAt ?? { x: place.x, y: clearY ?? place.y };


    // Escape closes Proton only, never a dialog underneath; arrows, Home and End move the blob
    const onDockKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && proton.open) {
            e.stopPropagation();
            e.preventDefault();
            close();
        }
    };
    const onBlobKey = (e: KeyboardEvent) => {
        const step = { ArrowUp: -0.05, ArrowDown: 0.05 }[e.key];
        if (step != null) change({ y: Math.min(1, Math.max(0, prefs.y + step)) });
        else if (e.key === "ArrowLeft" || e.key === "ArrowRight") change({ side: e.key === "ArrowLeft" ? "left" : "right" });
        else if (e.key === "Home" || e.key === "End") change({ y: e.key === "Home" ? 0 : 1 });
        else return;
        e.preventDefault();
    };

    const phone = viewport.width < PHONE;
    const layout: PanelLayout = phone
        ? { kind: "sheet", height: Math.round(viewport.visibleHeight * 0.88), folded: proton.navigations > unfoldedFor }
        : { kind: "bubble", style: bubbleStyle(at, prefs.side, viewport) };

    return createPortal(
        <div className={cx("proton-dock", `on-${prefs.side}`)} data-proton-layer="" data-mood={mood} onKeyDown={onDockKey}>
            {proton.open && (
                <ProtonPanel
                    chat={proton.chat}
                    conversation={conversation}
                    layout={layout}
                    saying={mood === "talking" ? proton.saying?.text ?? null : null}
                    still={still}
                    stillLooking={proton.askedAt != null && now - proton.askedAt >= STILL_LOOKING_AFTER_MS}
                    prefs={prefs}
                    onPrefs={change}
                    onUnfold={() => setUnfoldedFor(proton.navigations)}
                    onComposing={setComposing}
                    onClose={close}
                />
            )}
            {!proton.open && proton.peek && (
                <div className="proton-peek" style={{ top: at.y - 4, [prefs.side]: BLOB + 28 }}>
                    <button className="proton-peek-text" onClick={open}>{proton.peek}</button>
                    <button className="icon-btn" onClick={dismissPeek} aria-label="Dismiss"><Icon name="x" /></button>
                </div>
            )}
            <button
                ref={blob}
                className={cx("proton-blob", prefs.tucked && !proton.open && "tucked", still && "still", drag.dragAt && "dragging")}
                style={{ left: at.x, top: at.y, width: BLOB, height: BLOB }}
                data-mood={mood}
                aria-label={moodName(mood)}
                aria-expanded={proton.open}
                title="Proton: click to talk, drag to move"
                {...drag.handlers}
                onKeyDown={onBlobKey}
            >
                <BlobFigure mood={mood} saying={proton.saying} still={still} />
                {proton.unseen > 0 && <span className="proton-unseen" aria-hidden="true">{proton.unseen}</span>}
            </button>
            {/* read out once a reply is in, never while it is still being written */}
            <div className="sr" aria-live="polite">{proton.saying?.text ?? ""}</div>
        </div>,
        document.body,
    );
}

/** Above the blob when it sits low, below it when it sits high, against the same edge. */
function bubbleStyle(at: { x: number; y: number }, side: BlobPrefs["side"], viewport: Viewport) {
    const width = Math.min(400, viewport.width - 32);
    const low = at.y + BLOB / 2 > viewport.height / 2;
    const room = low ? at.y - 12 - 16 : viewport.height - (at.y + BLOB + 12) - 16;
    const height = Math.max(280, Math.min(620, room));
    return {
        width,
        height,
        [side]: 16,
        ...(low ? { top: Math.max(16, at.y - 12 - height) } : { top: at.y + BLOB + 12 }),
    };
}

type Viewport = { width: number; height: number; visibleHeight: number };

let viewportCache: Viewport | null = null;

function readViewport(): Viewport {
    const next = { width: window.innerWidth, height: window.innerHeight, visibleHeight: window.visualViewport?.height ?? window.innerHeight };
    if (!viewportCache || viewportCache.width !== next.width || viewportCache.height !== next.height || viewportCache.visibleHeight !== next.visibleHeight) {
        viewportCache = next;
    }

    return viewportCache;
}

/** The window's size, and how much of it a phone's keyboard leaves visible. */
function useViewport(): Viewport {
    return useSyncExternalStore((listener) => {
        window.addEventListener("resize", listener);
        window.visualViewport?.addEventListener("resize", listener);
        return () => {
            window.removeEventListener("resize", listener);
            window.visualViewport?.removeEventListener("resize", listener);
        };
    }, readViewport);
}

/**
 * The time the mood is worked out at: it moves on exactly when the mood could change (a question running long, a
 * reply said, an error or a success shown long enough, a card expiring), not every frame.
 */
function useMoodClock(proton: ProtonState): number {
    const [now, setNow] = useState(() => Date.now());
    const newest = proton.chat.turns.findLast((t) => t.from === "proton" && t.action != null);
    const cardExpires = newest?.from === "proton" && newest.action ? Date.parse(newest.action.expiresAt) : 0;

    useEffect(() => {
        const current = Date.now();
        const asked = proton.askedAt;
        const next = [
            asked != null ? asked + WORKING_AFTER_MS : 0, asked != null ? asked + STILL_LOOKING_AFTER_MS : 0,
            proton.saying?.until ?? 0, proton.errorUntil, proton.happyUntil, cardExpires,
        ].filter((t) => t > current).sort((a, b) => a - b)[0];
        if (next == null) return;
        const id = setTimeout(() => setNow(Date.now()), Math.min(next - current + 20, 2 ** 31 - 1));
        return () => clearTimeout(id);
    }, [proton.askedAt, proton.saying, proton.errorUntil, proton.happyUntil, cardExpires, now]);

    return Math.max(now, proton.askedAt ?? 0);
}

/**
 * Where the blob moves to so it doesn't sit on what the person is working with: the focused field (outside Proton),
 * a dialog's buttons, the message composer. Null when where it is is fine.
 */
function useKeepClear(box: Box, viewportHeight: number): number | null {
    const [clearY, setClearY] = useState<number | null>(null);
    const { x, y, width, height } = box;

    useEffect(() => {
        const rect = (el: Element): Box => {
            const r = el.getBoundingClientRect();
            return { x: r.left, y: r.top, width: r.width, height: r.height };
        };
        const update = () => {
            const active = document.activeElement;
            const obstacles = [...document.querySelectorAll(OBSTACLES)].map(rect);
            if (active && active !== document.body && !active.closest("[data-proton-layer]")) obstacles.unshift(rect(active));
            const moved = clearOf({ x, y, width, height }, obstacles, { height: viewportHeight });
            setClearY(moved === y ? null : moved);
        };
        document.addEventListener("focusin", update);
        document.addEventListener("focusout", update);
        return () => {
            document.removeEventListener("focusin", update);
            document.removeEventListener("focusout", update);
        };
    }, [x, y, width, height, viewportHeight]);

    return clearY;
}
