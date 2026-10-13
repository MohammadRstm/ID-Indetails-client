import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { projectWorkHandlers } from "@/test/fixtures/project";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { apiError, base, cards, contentOf, fileOf, itemOf, liveContent, menuOf, part, served } from "./portalTestKit";

// the preview of what clients would get is another component's, with its own tests
vi.mock("./PresentationPreview", () => ({
    default: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Preview"><button onClick={onClose}>Close preview</button></div>,
}));

/*
 * Rearranging a section's cards: with the keys, from a card's menu, and with a pointer. A card's place is saved when it
 * is dropped, and comes back if the API refuses it.
 */

const nadia = personas.designAdmin;

const at = (id: number, title: string, sortOrder: number) => itemOf(id, title, fileOf(id + 10, `${title}.jpg`), { sortOrder });
const living = at(5, "Living room", 0);
const kitchen = at(6, "Kitchen", 1);
const bedroom = at(7, "Bedroom", 2);
const three = () => liveContent(contentOf([living, kitchen, bedroom]));

/**
 * The mock of PUT sections/{section}/order: it keeps what it was sent, and answers the whole content in the new order,
 * unless a test makes it wait first or refuse.
 */
function orderApi(live: ReturnType<typeof liveContent>, how: { wait?: Promise<void>; refuse?: () => Response } = {}) {
    const sent: { section: string; itemIds: number[] }[] = [];
    const handler = http.put(`${base}/sections/:section/order`, async ({ request, params }) => {
        const { itemIds } = (await request.json()) as { itemIds: number[] };
        sent.push({ section: String(params.section), itemIds });
        await how.wait;
        if (how.refuse) return how.refuse();
        const items = live.box.content.items;
        live.box.content = { ...live.box.content, items: itemIds.map((id, i) => ({ ...items.find((x) => x.id === id)!, sortOrder: i })) };
        return HttpResponse.json(live.box.content);
    });
    return { sent, handler };
}

const grip = (title: string) => screen.findByRole("button", { name: `Reorder ${title}` });

describe("rearranging with the keys", () => {
    it("picks a card up with Space, moves it with an arrow, drops it with Space, and saves the new order", async () => {
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        (await grip("Living room")).focus();
        await userEvent.keyboard(" ");
        expect(await screen.findByText(/^Picked up Living room, position 1 of 3\./)).toBeInTheDocument();
        await userEvent.keyboard("{ArrowRight}");
        expect(await screen.findByText("Living room, position 2 of 3")).toBeInTheDocument();
        expect(cards()).toEqual(["Kitchen", "Living room", "Bedroom"]);
        // nothing is saved while the card is in the hand
        expect(api.sent).toEqual([]);
        await userEvent.keyboard(" ");

        expect(await screen.findByText("Order saved")).toBeInTheDocument();
        expect(api.sent).toEqual([{ section: "presentation", itemIds: [6, 5, 7] }]);
        expect(cards()).toEqual(["Kitchen", "Living room", "Bedroom"]);
        expect(screen.getByText("Living room moved to position 2 of 3")).toBeInTheDocument();
    });

    it("tells where a card can't go further, and puts it back on Escape", async () => {
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        (await grip("Living room")).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowLeft}");
        expect(await screen.findByText("Living room, position 1 of 3, as far as it goes")).toBeInTheDocument();
        await userEvent.keyboard("{ArrowRight}{ArrowRight}");
        expect(cards()).toEqual(["Kitchen", "Bedroom", "Living room"]);

        await userEvent.keyboard("{Escape}");
        expect(cards()).toEqual(["Living room", "Kitchen", "Bedroom"]);
        expect(await screen.findByText("Move cancelled. Living room is at position 1 of 3")).toBeInTheDocument();
        expect(api.sent).toEqual([]);
    });

    it("saves nothing when a card is put down where it was", async () => {
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        (await grip("Kitchen")).focus();
        await userEvent.keyboard("{Enter}");
        await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
        await userEvent.keyboard("{Enter}");

        expect(await screen.findByText("Kitchen put down, position 2 of 3")).toBeInTheDocument();
        expect(api.sent).toEqual([]);
    });
});

describe("rearranging from a card's menu", () => {
    it("moves a card to the start, earlier, later or to the end, offering only what is possible", async () => {
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        await menuOf("Bedroom");
        expect(screen.queryByRole("button", { name: "Move later" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Move to end" })).toBeNull();
        expect(screen.getByRole("button", { name: "Move earlier" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Move to start" }));

        expect(await screen.findByText("Order saved")).toBeInTheDocument();
        expect(api.sent).toEqual([{ section: "presentation", itemIds: [7, 5, 6] }]);
        expect(cards()).toEqual(["Bedroom", "Living room", "Kitchen"]);

        await menuOf("Bedroom");
        expect(screen.queryByRole("button", { name: "Move earlier" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Move to start" })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Move later" }));
        await waitFor(() => expect(api.sent).toHaveLength(2));
        expect(api.sent[1].itemIds).toEqual([5, 7, 6]);
    });

    it("shows the new order at once, saying the order is being saved until the API answers", async () => {
        let release!: () => void;
        const wait = new Promise<void>((resolve) => { release = resolve; });
        const live = three();
        const api = orderApi(live, { wait });
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        await menuOf("Living room");
        await userEvent.click(screen.getByRole("button", { name: "Move to end" }));
        expect(await screen.findByText("Saving order…")).toBeInTheDocument();
        expect(cards()).toEqual(["Kitchen", "Bedroom", "Living room"]);

        release();
        expect(await screen.findByText("Order saved")).toBeInTheDocument();
        expect(screen.queryByText("Saving order…")).toBeNull();
        expect(cards()).toEqual(["Kitchen", "Bedroom", "Living room"]);
    });
});

describe("when the order can't be saved", () => {
    it("puts the old order back, loads the section again and says so when someone changed it meanwhile", async () => {
        const live = three();
        const api = orderApi(live, {
            refuse: () => {
                // a colleague added a card in the meantime
                live.box.content = contentOf([living, kitchen, bedroom, at(8, "Dining", 3)]);
                return apiError(409, "portal_order_stale", "The section changed.");
            },
        });
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        await menuOf("Living room");
        await userEvent.click(screen.getByRole("button", { name: "Move to end" }));

        expect(await screen.findByText("Someone changed this section, so your move wasn't saved.")).toBeInTheDocument();
        expect(api.sent).toEqual([{ section: "presentation", itemIds: [6, 7, 5] }]);
        await waitFor(() => expect(cards()).toEqual(["Living room", "Kitchen", "Bedroom", "Dining"]));
        expect(live.box.gets).toBe(2);
        expect(screen.queryByText("Saving order…")).toBeNull();
    });

    it("puts the old order back and says why for any other failure", async () => {
        const live = three();
        const api = orderApi(live, { refuse: () => apiError(500, "internal_error", "Something broke on our side.") });
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        await menuOf("Living room");
        await userEvent.click(screen.getByRole("button", { name: "Move to end" }));

        expect(await screen.findByText("The new order wasn't saved")).toBeInTheDocument();
        expect(screen.getByText("Something broke on our side.")).toBeInTheDocument();
        await waitFor(() => expect(cards()).toEqual(["Living room", "Kitchen", "Bedroom"]));
        expect(screen.queryByText("Order saved")).toBeNull();
    });
});

describe("rearranging with a pointer", () => {
    beforeAll(() => {
        // jsdom may not know PointerEvent: a mouse event carries the same position
        if (typeof window.PointerEvent === "undefined") {
            Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: class extends MouseEvent {} });
        }
    });

    /** jsdom has no layout: the cards sit side by side, each 100 wide and 110 apart, in the order they are in the page. */
    function layOut() {
        const box = (left: number, top: number, width: number, height: number) =>
            ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
        vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
            if (!this.hasAttribute("data-card")) return box(0, 0, 0, 0);
            return box(Array.from(this.parentElement!.children).indexOf(this) * 110, 250, 100, 100);
        });
    }

    it("drags a card by its handle onto another card's place, and saves the order when it is let go", async () => {
        layOut();
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        fireEvent.pointerDown(await grip("Living room"), { button: 0, clientX: 50, clientY: 300, pointerId: 1 });
        // a copy follows the pointer, and the card's own place waits as a dashed outline
        expect(document.querySelector(".pc-ghost")).not.toBeNull();
        expect(screen.getByRole("article", { name: "Living room" })).toHaveClass("placeholder");

        // over the third card: it takes the dragged card's place, and the others make room
        fireEvent.pointerMove(window, { clientX: 270, clientY: 300, pointerId: 1 });
        expect(cards()).toEqual(["Kitchen", "Bedroom", "Living room"]);
        expect(api.sent).toEqual([]);

        fireEvent.pointerUp(window, { clientX: 270, clientY: 300, pointerId: 1 });
        expect(document.querySelector(".pc-ghost")).toBeNull();
        expect(await screen.findByText("Order saved")).toBeInTheDocument();
        expect(api.sent).toEqual([{ section: "presentation", itemIds: [6, 7, 5] }]);
        expect(cards()).toEqual(["Kitchen", "Bedroom", "Living room"]);
        expect(screen.getByRole("article", { name: "Living room" })).not.toHaveClass("placeholder");
    });

    it("puts the card back, and saves nothing, when Escape is pressed during a drag", async () => {
        layOut();
        const live = three();
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        fireEvent.pointerDown(await grip("Living room"), { button: 0, clientX: 50, clientY: 300, pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 160, clientY: 300, pointerId: 1 });
        expect(cards()).toEqual(["Kitchen", "Living room", "Bedroom"]);

        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".pc-ghost")).toBeNull();
        expect(cards()).toEqual(["Living room", "Kitchen", "Bedroom"]);
        // letting go afterwards does nothing: the drag is over
        fireEvent.pointerUp(window, { clientX: 160, clientY: 300, pointerId: 1 });
        expect(api.sent).toEqual([]);
    });
});

describe("where cards can't be rearranged", () => {
    it("has no handles for an archived project, a section with one card, or the removed cards", async () => {
        const archived = contentOf([living, kitchen], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." });
        const { unmount } = renderApp(part("presentation"), nadia, served(archived), ...projectWorkHandlers);
        await screen.findByRole("article", { name: "Kitchen" });
        expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();
        expect(screen.queryByText(/Drag a card by its handle/)).toBeNull();
        unmount();

        // one card is nothing to rearrange; the removed one stays out of it
        const gone = itemOf(9, "Old render", fileOf(19, "old.jpg"), { state: "removed" });
        renderApp(part("presentation"), nadia, served(contentOf([living, gone])), ...projectWorkHandlers);
        await screen.findByRole("article", { name: "Old render" });
        expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();
        expect(screen.queryByText(/Drag a card by its handle/)).toBeNull();
    });

    it("keeps a card's section when it is rearranged: only that section's cards are sent", async () => {
        const walk = itemOf(8, "Walkthrough", fileOf(18, "walk.mp4", { contentType: "video/mp4", preview: "video" }), { section: "model", sortOrder: 0 });
        const live = liveContent(contentOf([living, kitchen, walk]));
        const api = orderApi(live);
        renderApp(part("presentation"), nadia, live.handler, api.handler, ...projectWorkHandlers);

        await menuOf("Kitchen");
        await userEvent.click(screen.getByRole("button", { name: "Move to start" }));
        await waitFor(() => expect(api.sent).toHaveLength(1));
        expect(api.sent[0]).toEqual({ section: "presentation", itemIds: [6, 5] });
    });
});
