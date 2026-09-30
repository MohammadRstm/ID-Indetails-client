/*
 * The prototype's chart tooltip (HL.tip): one element for the whole app, moved and filled directly, so
 * hovering across a chart doesn't re-render anything. <TipHost /> puts the element on the page.
 *
 * A line is a string, { big } (a bold title) or { k, v } (a label and its value).
 */

export type TipLine = string | { big: string } | { k: string; v: string | number } | null | undefined | false;

type PointerLike = { clientX: number; clientY: number };

function el(): HTMLElement | null {
    return document.getElementById("tip");
}

export const tip = {
    show(event: PointerLike, lines: TipLine | TipLine[]) {
        const t = el();
        if (!t) return;
        t.textContent = "";
        for (const line of Array.isArray(lines) ? lines : [lines]) {
            if (line == null || line === false) continue;
            const row = document.createElement("div");
            if (typeof line === "string") {
                row.textContent = line;
                row.className = "tt";
            } else if ("big" in line) {
                row.textContent = line.big;
                row.style.fontWeight = "650";
                row.style.fontSize = "12.5px";
            } else {
                row.className = "tr";
                const k = document.createElement("span");
                k.className = "tt";
                k.textContent = line.k;
                const v = document.createElement("span");
                v.style.fontWeight = "650";
                v.textContent = String(line.v);
                row.append(k, v);
            }
            t.appendChild(row);
        }
        t.hidden = false;
        tip.move(event);
    },

    move(event: PointerLike) {
        const t = el();
        if (!t || t.hidden) return;
        let x = event.clientX + 14, y = event.clientY + 16;
        const r = t.getBoundingClientRect();
        if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - 12;
        if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - 12;
        t.style.left = `${Math.max(8, x)}px`;
        t.style.top = `${Math.max(8, y)}px`;
    },

    hide() {
        const t = el();
        if (t) t.hidden = true;
    },
};
