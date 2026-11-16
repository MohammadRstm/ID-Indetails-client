import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { revealInStrip } from "@/shared/utils/revealInStrip";

export type TabItem<K extends string> = { key: K; label: ReactNode; count?: number | null };

type TabsProps<K extends string> = {
    items: TabItem<K>[];
    value: K;
    onChange: (key: K) => void;
};

/**
 * A page's sections (the prototype's UI.SectionNav). When they don't fit, the row scrolls sideways with no scroll
 * bar: a side with more sections fades out, line and all, and shows a small arrow that scrolls that way.
 */
export default function Tabs<K extends string>({ items, value, onChange }: TabsProps<K>) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ l: false, r: false });

    function measure() {
        const el = ref.current;
        if (!el) return;
        const l = el.scrollLeft > 2, r = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
        setEdges((o) => (o.l === l && o.r === r ? o : { l, r }));
    }
    // observed afresh after every render, which measures it too: the window resizes, and counts load into the tabs
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    });
    const by = (dir: number) => ref.current?.scrollBy?.({ left: dir * Math.max(160, ref.current.clientWidth * 0.6), behavior: "smooth" });

    return (
        <div className={cx("tabs-scroll", edges.l && "fade-l", edges.r && "fade-r")}>
            {/* for a pointer: from the keyboard, the focused tab scrolls into view by itself */}
            {edges.l && <button type="button" className="tabs-arrow l" tabIndex={-1} aria-label="Earlier sections" onClick={() => by(-1)}><Icon name="chevronLeft" /></button>}
            <div className="tabs" role="tablist" ref={ref} onScroll={measure}>
                {items.map((item) => (
                    <button key={item.key} role="tab" aria-selected={value === item.key} className={cx("tab", value === item.key && "on")}
                        ref={value === item.key ? revealInStrip : undefined} onClick={() => onChange(item.key)}>
                        {item.label}
                        {item.count != null && <> <span className="muted num">{item.count}</span></>}
                    </button>
                ))}
            </div>
            {edges.r && <button type="button" className="tabs-arrow r" tabIndex={-1} aria-label="More sections" onClick={() => by(1)}><Icon name="chevronRight" /></button>}
        </div>
    );
}
