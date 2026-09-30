import type { RefObject } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

type PagerProps = {
    /** 1-based, as the API counts pages. */
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    /** Scrolled into view after a page change, so the reader starts at the top of the list. */
    anchor?: RefObject<HTMLElement | null>;
};

/** "31–60 of 142 ‹ 1 2 3 ›" (the prototype's UI.Pager). Nothing when everything fits on one page. */
export default function Pager({ page, pageSize, total, onPage, anchor }: PagerProps) {
    const pages = Math.ceil(total / pageSize);
    if (pages <= 1) return null;

    function go(next: number) {
        onPage(next);
        setTimeout(() => anchor?.current?.scrollIntoView?.({ block: "start" }), 30);
    }

    const from = (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    // Long lists show the first, last and nearby pages.
    const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => pages <= 9 || n === 1 || n === pages || Math.abs(n - page) <= 2);

    return (
        <div className="pager">
            <span className="muted">{from}–{to} of {total}</span>
            <span className="grow" />
            <button className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
                <Icon name="chevronLeft" />
            </button>
            {numbers.map((n, i) => (
                <span key={n} className="row" style={{ gap: 0 }}>
                    {i > 0 && n - numbers[i - 1] > 1 && <span className="muted" style={{ padding: "0 4px" }}>…</span>}
                    <button className={cx("pager-n", n === page && "on")} aria-current={n === page ? "page" : undefined} onClick={() => go(n)}>
                        {n}
                    </button>
                </span>
            ))}
            <button className="icon-btn" aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)}>
                <Icon name="chevronRight" />
            </button>
        </div>
    );
}
