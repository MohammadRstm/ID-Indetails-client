import type { ReactNode } from "react";
import { cx } from "@/shared/utils/cx";

export type TabItem<K extends string> = { key: K; label: ReactNode; count?: number | null };

type TabsProps<K extends string> = {
    items: TabItem<K>[];
    value: K;
    onChange: (key: K) => void;
};

/** A page's sections (the prototype's UI.SectionNav). */
export default function Tabs<K extends string>({ items, value, onChange }: TabsProps<K>) {
    return (
        <div className="tabs" role="tablist">
            {items.map((item) => (
                <button key={item.key} role="tab" aria-selected={value === item.key} className={cx("tab", value === item.key && "on")}
                    onClick={() => onChange(item.key)}>
                    {item.label}
                    {item.count != null && <> <span className="muted num">{item.count}</span></>}
                </button>
            ))}
        </div>
    );
}
