import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
import { cx } from "@/shared/utils/cx";
import { revealInStrip } from "@/shared/utils/revealInStrip";

/** Every section has an icon before its name, so the row reads at a glance. */
export type TabItem<K extends string> = { key: K; label: ReactNode; icon: IconName; count?: number | null };

/** Each section's icon keeps its own colour wherever it appears; one without its own takes the next of the rest. */
const ICON_COLORS: Partial<Record<IconName, string>> = {
    overview: "#2F6FEB", projects: "#5B5BD6", chartTile: "#0E8A84", card: "#B7791F", edit: "#E0603F", target: "#C026A3",
    activity: "#0B8DB8", people: "#8B5CF6", checkCircle: "#2F9E44", clock: "#D9730D", calendar: "#D6336C", folder: "#9C6644",
    browser: "#5F7085", briefcase: "#7C8A16", file: "#0F9F75", trendDown: "#E03131", timer: "#9D3FC7", list: "#4C6EF5",
    building: "#A26769", archive: "#868E96",
};
const SPARE = ["#2F6FEB", "#D9730D", "#2F9E44", "#C026A3", "#0E8A84", "#8B5CF6"];
const iconColor = (icon: IconName, index: number) => ICON_COLORS[icon] ?? SPARE[index % SPARE.length];

type TabsProps<K extends string> = {
    items: TabItem<K>[];
    value: K;
    onChange: (key: K) => void;
};

/**
 * A page's sections (the prototype's UI.SectionNav). The open one sits on a raised card, like a browser's tab, which
 * glides to whichever section is chosen. When they don't fit, the row scrolls sideways with no scroll bar: a side with
 * more sections fades out, line and all, and shows a small arrow that scrolls that way.
 */
export default function Tabs<K extends string>({ items, value, onChange }: TabsProps<K>) {
    const ref = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLSpanElement>(null);
    const [edges, setEdges] = useState({ l: false, r: false });

    function measure() {
        const el = ref.current;
        if (!el) return;
        const l = el.scrollLeft > 2, r = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
        setEdges((o) => (o.l === l && o.r === r ? o : { l, r }));
    }
    /** Puts the card under the open section; it appears in place at first, and only glides once it is there. */
    function placeCard() {
        const box = card.current, tab = ref.current?.querySelector<HTMLElement>(".tab.on");
        if (!box) return;
        box.style.opacity = tab ? "1" : "0";
        if (!tab) return;
        box.style.transform = `translateX(${tab.offsetLeft}px)`;
        box.style.width = `${tab.offsetWidth}px`;
        if (!box.classList.contains("glides")) requestAnimationFrame(() => box.classList.add("glides"));
    }
    // after every render: another section was chosen, or counts loaded into the tabs and widened them
    useLayoutEffect(() => placeCard());
    // observed afresh after every render, which measures it too: the window resizes, and counts load into the tabs
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => { measure(); placeCard(); });
        ro.observe(el);
        return () => ro.disconnect();
    });
    const by = (dir: number) => ref.current?.scrollBy?.({ left: dir * Math.max(160, ref.current.clientWidth * 0.6), behavior: "smooth" });

    return (
        <div className={cx("tabs-scroll", edges.l && "fade-l", edges.r && "fade-r")}>
            {/* for a pointer: from the keyboard, the focused tab scrolls into view by itself */}
            {edges.l && <button type="button" className="tabs-arrow l" tabIndex={-1} aria-label="Earlier sections" onClick={() => by(-1)}><Icon name="chevronLeft" /></button>}
            <div className="tabs" role="tablist" ref={ref} onScroll={measure}>
                <span className="tabs-cover" ref={card} aria-hidden="true" />
                {items.map((item, i) => (
                    <button key={item.key} role="tab" aria-selected={value === item.key} className={cx("tab", value === item.key && "on")}
                        style={{ "--tab-ic": iconColor(item.icon, i) } as CSSProperties}
                        ref={value === item.key ? revealInStrip : undefined} onClick={() => onChange(item.key)}>
                        <Icon name={item.icon} />
                        {item.label}
                        {item.count != null && <> <span className="muted num">{item.count}</span></>}
                    </button>
                ))}
            </div>
            {edges.r && <button type="button" className="tabs-arrow r" tabIndex={-1} aria-label="More sections" onClick={() => by(1)}><Icon name="chevronRight" /></button>}
        </div>
    );
}
