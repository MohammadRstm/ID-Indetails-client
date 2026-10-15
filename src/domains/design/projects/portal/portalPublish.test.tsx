import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { projectWorkHandlers } from "@/test/fixtures/project";
import { renderApp } from "@/test/renderApp";
import type { PortalContentItem } from "./contentApi";
import { apiError, base, cards, contentOf, fileOf, heroOf, itemOf, liveContent, part, person, projectId, publisher, served } from "./portalTestKit";

/*
 * Publishing the client portal: where it stands, Publish and Discard, the preview, the hero images and the introduction,
 * and what a card says about its file. The mock API holds the client's files and answers as the real one is meant to.
 */

// Nadia, with client_portal:manage handed to her
const nadia = publisher;

// 12:20 UTC is 15:20 in Beirut, shown on the company's clock
const published = { publishedAt: "2026-10-14T12:20:00Z", publishedBy: person };
const living = itemOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"));
const kitchen = itemOf(6, "Kitchen", fileOf(12, "Kitchen.jpg"));
const bedroom = itemOf(7, "Bedroom", fileOf(13, "Bedroom.jpg"));
const publishButton = () => screen.getByRole("button", { name: "Publish changes" });

describe("where the client portal stands", () => {
    it("says it has never been published, counts what is unpublished, and offers no Discard yet", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([living, kitchen])), ...projectWorkHandlers);

        expect(await screen.findByText("Not published yet")).toBeInTheDocument();
        expect(screen.getByText("· 2 unpublished changes")).toBeInTheDocument();
        expect(publishButton()).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    });

    it("says when and by whom it was published, and counts files, order, hero and introduction", async () => {
        const items = [
            itemOf(5, "Settled", fileOf(11, "settled.jpg"), { state: "unchanged" }),
            itemOf(6, "Edited", fileOf(12, "edited.jpg"), { state: "changed" }),
            itemOf(7, "Gone", fileOf(13, "gone.jpg"), { state: "removed" }),
        ];
        // a changed file, a removed one, the order of 3D, the hero and the introduction
        renderApp(part("presentation"), nadia, ...projectWorkHandlers,
            served(contentOf(items, { publication: published, changes: { reordered: ["model"], heroChanged: true, summaryChanged: true } })));

        expect(await screen.findByText("Published 14 Oct 2026, 3:20 PM by Nadia Karam")).toBeInTheDocument();
        expect(screen.getByText("· 5 unpublished changes")).toBeInTheDocument();
        expect(publishButton()).toBeEnabled();
        expect(screen.getByRole("button", { name: "Discard changes" })).toBeInTheDocument();
    });

    it("says everything is published when nothing is waiting, and then has nothing to publish or discard", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([{ ...living, state: "unchanged" }], { publication: published })), ...projectWorkHandlers);

        expect(await screen.findByText("· Everything is published")).toBeInTheDocument();
        expect(publishButton()).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    });

    it("has nothing to publish before there is anything in the drafts", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([])), ...projectWorkHandlers);

        expect(await screen.findByText("Not published yet")).toBeInTheDocument();
        expect(screen.getByText("· Nothing to publish yet")).toBeInTheDocument();
        expect(publishButton()).toBeDisabled();
    });

    it("is above every one of the three parts", async () => {
        renderApp(part("drawing"), nadia, served(contentOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("Not published yet")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        // the Client portal lists only what was chosen for the client
        expect(await screen.findByText("No 3D files for the client yet")).toBeInTheDocument();
        expect(screen.getByText("Not published yet")).toBeInTheDocument();
    });
});

describe("publishing", () => {
    it("lists what clients will get, then publishes it with the revision the person looked at", async () => {
        const items = [living, kitchen, { ...bedroom, state: "changed" as const }, itemOf(8, "Old plan", fileOf(14, "old.jpg"), { state: "removed" })];
        const before = contentOf(items, {
            publication: published, heroes: [heroOf(12, "Kitchen.jpg")], summary: "Welcome home.",
            changes: { reordered: ["model"], heroChanged: true, summaryChanged: true },
        });
        const after = contentOf(items.slice(0, 3).map((i) => ({ ...i, state: "unchanged" as const })), {
            publication: { publishedAt: "2026-10-15T08:00:00Z", publishedBy: person }, revision: 8, heroes: before.heroes, summary: before.summary,
        });
        const live = liveContent(before);
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.post(`${base}/publish`, async ({ request }) => {
                sent.push(await request.json());
                live.box.content = after;
                return HttpResponse.json(after);
            }));

        await userEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
        const dialog = screen.getByRole("dialog", { name: "Publish to your client?" });
        for (const line of ["2 new files", "1 updated file", "1 file removed", "New order in 3D", "New hero images", "New introduction"]) {
            expect(within(dialog).getByText(line)).toBeInTheDocument();
        }
        expect(within(dialog).getByText("Clients see this version at once. Nobody is notified yet.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.click(within(dialog).getByRole("button", { name: "Publish changes" }));
        expect(await screen.findByText("Published. Clients now see this version.")).toBeInTheDocument();
        expect(sent).toEqual([{ expectedRevision: 7 }]);
        expect(screen.queryByRole("dialog", { name: "Publish to your client?" })).toBeNull();
        expect(await screen.findByText("· Everything is published")).toBeInTheDocument();
        expect(screen.getByText("Published 15 Oct 2026, 11:00 AM by Nadia Karam")).toBeInTheDocument();
    });

    it("loads the drafts again, and says so, when someone changed them since the person looked", async () => {
        const live = liveContent(contentOf([living, kitchen]));
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.post(`${base}/publish`, () => {
                // a colleague added a file in the meantime
                live.box.content = contentOf([living, kitchen, bedroom], { revision: 8 });
                return apiError(409, "portal_revision_stale", "The drafts changed.");
            }));

        await userEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
        await userEvent.click(within(screen.getByRole("dialog", { name: "Publish to your client?" })).getByRole("button", { name: "Publish changes" }));

        expect(await screen.findByText("Someone changed the drafts since you looked. Check what's new and publish again.")).toBeInTheDocument();
        expect(live.box.gets).toBe(2);
        expect(await screen.findByText("· 3 unpublished changes")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps the window open with the reason when publishing fails for another reason", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([living])), ...projectWorkHandlers,
            http.post(`${base}/publish`, () => apiError(500, "internal_error", "Something broke on our side.")));

        await userEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
        const dialog = screen.getByRole("dialog", { name: "Publish to your client?" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Publish changes" }));

        expect(await within(dialog).findByText("Something broke on our side.")).toBeInTheDocument();
        expect(screen.queryByText("Published. Clients now see this version.")).toBeNull();
    });
});

describe("discarding", () => {
    it("asks first, then puts the drafts back to what clients see, with the revision the person looked at", async () => {
        const settled = { ...living, state: "unchanged" as const };
        const live = liveContent(contentOf([settled, kitchen], { publication: published }));
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.post(`${base}/discard`, async ({ request }) => {
                sent.push(await request.json());
                live.box.content = contentOf([settled], { publication: published, revision: 8 });
                return HttpResponse.json(live.box.content);
            }));

        await userEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
        let dialog = screen.getByRole("dialog", { name: "Discard changes?" });
        expect(within(dialog).getByText("Put the client's files, the hero images and the introduction back to what clients see? The files themselves stay in Project files. This can't be undone.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Keep the drafts" }));
        expect(sent).toEqual([]);
        expect(screen.queryByRole("dialog")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
        dialog = screen.getByRole("dialog", { name: "Discard changes?" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));

        expect(await screen.findByText("Changes discarded")).toBeInTheDocument();
        expect(sent).toEqual([{ expectedRevision: 7 }]);
        await waitFor(() => expect(cards()).toEqual(["Living room v3"]));
        expect(await screen.findByText("· Everything is published")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    });
});

describe("the preview", () => {
    it("opens what clients would get in a new browser tab, and leaves this one as it was", async () => {
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        try {
            renderApp(part("presentation"), nadia, served(contentOf([living])), ...projectWorkHandlers);

            await userEvent.click(await screen.findByRole("button", { name: "Preview" }));
            expect(open).toHaveBeenCalledTimes(1);
            expect(open).toHaveBeenCalledWith(`/design/projects/${projectId}/portal-preview`, "_blank");
            // nothing opens over this page, and its link stays the same
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(window.location.search).toBe("?tab=portal&part=presentation");
        } finally {
            open.mockRestore();
        }
    });
});

describe("the hero images", () => {
    /** The hero images' list, in its order: each one's name and picture. */
    const heroRows = () => within(screen.getByRole("list", { name: "Hero images" })).getAllByRole("listitem").map((li) => ({
        name: li.querySelector(".pc-hero-name .trunc")?.textContent,
        src: li.querySelector("img")?.getAttribute("src"),
    }));
    const asHero = (item: PortalContentItem) => ({ ...item, isHero: true });

    it("are added from the images that can be one, at the end, and the part says they differ from what clients see", async () => {
        const plan = itemOf(8, "Floor plan", fileOf(15, "plan.pdf", { contentType: "application/pdf", preview: "pdf" }));
        const gone = itemOf(9, "Old render", fileOf(16, "old.jpg"), { state: "removed" });
        const live = liveContent(contentOf([asHero(living), kitchen, plan, gone], { heroes: [heroOf(11, "Living room v3.jpg")] }));
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.post(`${base}/heroes`, async ({ request }) => {
                sent.push(await request.json());
                live.box.content = contentOf([asHero(living), asHero(kitchen), plan, gone], {
                    heroes: [heroOf(11, "Living room v3.jpg"), heroOf(12, "Kitchen.jpg")], changes: { heroChanged: true },
                });
                return HttpResponse.json(live.box.content);
            }));

        await screen.findByRole("list", { name: "Hero images" });
        expect(heroRows()).toEqual([{ name: "Living room v3.jpg", src: "/api/content-store/previews/11" }]);
        await userEvent.click(screen.getByRole("button", { name: "Choose from images" }));
        const dialog = screen.getByRole("dialog", { name: "Add a hero image" });
        // only a JPG, PNG or WebP image that is still in the drafts, and not one already
        expect(within(dialog).getByRole("button", { name: /Living room v3/ })).toBeDisabled();
        expect(within(dialog).getByText("A hero image")).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Floor plan" })).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "Old render" })).toBeNull();

        await userEvent.click(within(dialog).getByRole("button", { name: "Kitchen" }));
        expect(await screen.findByText("Hero image added")).toBeInTheDocument();
        expect(sent).toEqual([{ itemId: 6 }]);
        expect(screen.queryByRole("dialog", { name: "Add a hero image" })).toBeNull();
        expect(heroRows()).toEqual([
            { name: "Living room v3.jpg", src: "/api/content-store/previews/11" },
            { name: "Kitchen.jpg", src: "/api/content-store/previews/12" },
        ]);
        expect(screen.getByText("Changed since last publish")).toBeInTheDocument();
        expect(within(screen.getByRole("article", { name: "Kitchen" })).getByText("Hero")).toBeInTheDocument();
    });

    it("are put in order with Move earlier and Move later, which send the whole new order", async () => {
        const heroes = [heroOf(11, "Living room v3.jpg"), heroOf(12, "Kitchen.jpg"), heroOf(13, "Bedroom.jpg")];
        const live = liveContent(contentOf([asHero(living), asHero(kitchen), asHero(bedroom)], { heroes }));
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${base}/heroes/order`, async ({ request }) => {
                const body = (await request.json()) as { fileIds: number[] };
                sent.push(body);
                live.box.content = { ...live.box.content, heroes: body.fileIds.map((id) => heroes.find((h) => h.fileId === id)!), changes: { ...live.box.content.changes, heroChanged: true } };
                return HttpResponse.json(live.box.content);
            }));

        await screen.findByRole("list", { name: "Hero images" });
        // the first can't go earlier, nor the last later
        expect(screen.getByRole("button", { name: "Move Living room v3.jpg earlier" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Move Bedroom.jpg later" })).toBeDisabled();
        expect(screen.getByText("First: the big one")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Move Bedroom.jpg earlier" }));
        await waitFor(() => expect(heroRows().map((r) => r.name)).toEqual(["Living room v3.jpg", "Bedroom.jpg", "Kitchen.jpg"]));
        await userEvent.click(screen.getByRole("button", { name: "Move Living room v3.jpg later" }));
        await waitFor(() => expect(heroRows().map((r) => r.name)).toEqual(["Bedroom.jpg", "Living room v3.jpg", "Kitchen.jpg"]));

        expect(sent).toEqual([{ fileIds: [11, 13, 12] }, { fileIds: [13, 11, 12] }]);
        // a screen reader is told where it went
        expect(await screen.findByText("Living room v3.jpg is now 2 of 3.")).toBeInTheDocument();
        expect(screen.getByText("Changed since last publish")).toBeInTheDocument();
    });

    it("are taken off one at a time, and the files stay", async () => {
        const live = liveContent(contentOf([asHero(living), asHero(kitchen)], { heroes: [heroOf(11, "Living room v3.jpg"), heroOf(12, "Kitchen.jpg")], publication: published }));
        const removed: string[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.delete(`${base}/heroes/:fileId`, ({ params }) => {
                removed.push(String(params.fileId));
                live.box.content = contentOf([living, asHero(kitchen)], { heroes: [heroOf(12, "Kitchen.jpg")], publication: published, changes: { heroChanged: true } });
                return HttpResponse.json(live.box.content);
            }));

        await screen.findByRole("list", { name: "Hero images" });
        await userEvent.click(screen.getByRole("button", { name: "Remove Living room v3.jpg" }));

        expect(await screen.findByText("Hero image removed")).toBeInTheDocument();
        expect(removed).toEqual(["11"]);
        expect(heroRows().map((r) => r.name)).toEqual(["Kitchen.jpg"]);
        expect(screen.getByRole("article", { name: "Living room v3" })).toBeInTheDocument();
        expect(screen.getByText("Changed since last publish")).toBeInTheDocument();
    });

    it("stop at 12: nothing more can be added until one is taken off", async () => {
        const twelve = Array.from({ length: 12 }, (_, i) => heroOf(100 + i, `Picture ${i + 1}.jpg`));
        renderApp(part("presentation"), nadia, served(contentOf([living, kitchen], { heroes: twelve })), ...projectWorkHandlers);

        await screen.findByRole("list", { name: "Hero images" });
        expect(heroRows()).toHaveLength(12);
        expect(screen.getByRole("button", { name: "Upload hero image" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Choose from images" })).toBeDisabled();
        expect(screen.getByText("That's the most there can be. Remove one to add another.")).toBeInTheDocument();
    });

    it("says so when there are none yet", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([living])), ...projectWorkHandlers);
        expect(await screen.findByText("No hero image yet")).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Hero images" })).toBeNull();
    });
});

describe("the introduction", () => {
    it("tells as it is typed when it is too long, and saves it when it isn't", async () => {
        const live = liveContent(contentOf([living]));
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${base}/summary`, async ({ request }) => {
                const body = (await request.json()) as { summary: string | null };
                sent.push(body);
                live.box.content = contentOf([living], { summary: body.summary, changes: { summaryChanged: true } });
                return HttpResponse.json(live.box.content);
            }));

        const box = await screen.findByLabelText("Introduction for the client");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        expect(screen.getByText("0 / 2000")).toBeInTheDocument();

        fireEvent.change(box, { target: { value: "x".repeat(2001) } });
        expect(screen.getByText("Use at most 2000 characters.")).toBeInTheDocument();
        expect(screen.getByText("2001 / 2000")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(sent).toEqual([]);

        fireEvent.change(box, { target: { value: "Welcome to your new home." } });
        expect(screen.queryByText("Use at most 2000 characters.")).toBeNull();
        expect(screen.getByText("25 / 2000")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("Introduction saved")).toBeInTheDocument();
        expect(sent).toEqual([{ summary: "Welcome to your new home." }]);
        // the saved text is what the box shows, with nothing left to save
        expect(screen.getByLabelText("Introduction for the client")).toHaveValue("Welcome to your new home.");
        await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
        expect(await screen.findByText("Changed since last publish")).toBeInTheDocument();
    });

    it("goes back to the saved text on Cancel, and saves nothing for an emptied box", async () => {
        const live = liveContent(contentOf([living], { summary: "Hello", publication: published }));
        const sent: unknown[] = [];
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${base}/summary`, async ({ request }) => {
                sent.push(await request.json());
                live.box.content = contentOf([living], { summary: null, publication: published, changes: { summaryChanged: true } });
                return HttpResponse.json(live.box.content);
            }));

        const box = await screen.findByLabelText("Introduction for the client");
        expect(box).toHaveValue("Hello");
        await userEvent.type(box, " there");
        expect(box).toHaveValue("Hello there");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(box).toHaveValue("Hello");
        expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

        await userEvent.clear(box);
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Introduction saved")).toBeInTheDocument();
        expect(sent).toEqual([{ summary: null }]);
        expect(screen.getByLabelText("Introduction for the client")).toHaveValue("");
    });
});

describe("what a card says about its file", () => {
    it("tells whether it is new, changed, removed or published, and marks the hero", async () => {
        const items = [
            itemOf(1, "Fresh", fileOf(21, "fresh.jpg")),
            itemOf(2, "Edited", fileOf(22, "edited.jpg"), { state: "changed" }),
            itemOf(3, "Settled", fileOf(23, "settled.jpg"), { state: "unchanged", isHero: true }),
            itemOf(4, "Gone", fileOf(24, "gone.jpg"), { state: "removed" }),
        ];
        renderApp(part("presentation"), nadia, served(contentOf(items, { publication: published })), ...projectWorkHandlers);

        const card = async (title: string) => within(await screen.findByRole("article", { name: title }));
        expect((await card("Fresh")).getByText("New")).toBeInTheDocument();
        expect((await card("Edited")).getByText("Changed")).toBeInTheDocument();
        expect((await card("Settled")).getByText("Published")).toBeInTheDocument();
        expect((await card("Settled")).getByText("Hero")).toBeInTheDocument();
        expect((await card("Gone")).getByText("Removed")).toBeInTheDocument();
        expect((await card("Fresh")).queryByText("Draft")).toBeNull();
    });
});

describe("an archived project", () => {
    it("shows where things stand and the preview, and offers nothing to change", async () => {
        const items = [{ ...living, state: "unchanged" as const }, { ...kitchen, state: "unchanged" as const }];
        renderApp(part("presentation"), nadia, ...projectWorkHandlers, served(contentOf(items, {
            canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed.",
            publication: published, heroes: [heroOf(12, "Kitchen.jpg")], summary: "Welcome home.",
        })));

        expect(await screen.findByText("Published 14 Oct 2026, 3:20 PM by Nadia Karam")).toBeInTheDocument();
        expect(screen.getByText("· Everything is published")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
        for (const name of ["Publish changes", "Discard changes", "Upload hero image", "Choose from images", /^Move .* (earlier|later)$/, /^Remove /, "Save", "Cancel", "Upload files", /^Reorder /, "Undo"]) {
            expect(screen.queryByRole("button", { name })).toBeNull();
        }
        // the hero images and the introduction can be read
        expect(within(screen.getByRole("list", { name: "Hero images" })).getByText("Kitchen.jpg")).toBeInTheDocument();
        expect(screen.getByText("Welcome home.")).toBeInTheDocument();
        expect(screen.queryByLabelText("Introduction for the client")).toBeNull();
        expect(screen.queryByLabelText("Hero image to upload")).toBeNull();
    });
});
