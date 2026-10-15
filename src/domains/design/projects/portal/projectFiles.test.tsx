import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { ProjectFile } from "./filesApi";
import { filesBase, filesOf, filesPart, liveFiles, projectFileOf, sarahRef, servedFiles, uploadApi } from "./filesTestKit";
import { apiError, cards, contentOf, fileOf, inMenu, itemOf, MB, menuItems, menuOf, page, publisher, served, usageOf } from "./portalTestKit";
import { resetUploads, UPLOAD_MS } from "./uploads";

/*
 * A Design project's Project files tab: who gets it, a section's files with their uploads, what each person may change,
 * a card's menu, and choosing the files that go to the client. Part links in the mock API are relative
 * (/api/content-store/parts/p1), as the API gives them in development.
 */

const nadia = personas.designAdmin;
const sarah = personas.designEmployee;

const living = projectFileOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"));
const hero = projectFileOf(6, "Hero shot", fileOf(12, "IMG_0042.jpg", { originalBytes: 1.5 * MB, storedBytes: 1.5 * MB }), { sortOrder: 1 });
const kitchen = projectFileOf(9, "Kitchen", fileOf(19, "Kitchen.jpg"));
const planItem = projectFileOf(21, "plan", fileOf(31, "plan.jpg", { originalBytes: 6, storedBytes: 6 }));

const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const parts = () => within(screen.getByRole("tablist", { name: "Project files" })).getAllByRole("tab").map((t) => t.textContent);
const section = () => document.querySelector(".pc-drop") as HTMLElement;
const small = (name = "plan.jpg") => new File(["abcdef"], name, { type: "image/jpeg" });
const internal = http.get("/api/projects/:id", () => HttpResponse.json({ ...projectWork.project, billingType: "internal", client: null }));

// Wednesday 30 September 2026, noon in Beirut
const waits = { retry: [...UPLOAD_MS.retry], done: UPLOAD_MS.done, refresh: UPLOAD_MS.refresh };
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    // no waiting between a part's tries, and a finished file leaves the list at once
    UPLOAD_MS.retry = [0, 0, 0];
    UPLOAD_MS.done = 0;
    // the files aren't loaded again after the last upload, unless a test wants that
    UPLOAD_MS.refresh = 60_000;
});
afterEach(() => {
    vi.useRealTimers();
    resetUploads();
    UPLOAD_MS.retry = waits.retry;
    UPLOAD_MS.done = waits.done;
    UPLOAD_MS.refresh = waits.refresh;
});

describe("who gets the Project files tab", () => {
    it("gives an employee the tab on a Design client project, after Meetings, with its three sections kept in the link", async () => {
        renderApp(page, sarah, servedFiles(filesOf([living], { canManage: false })), ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Project files" }));
        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Requirements", "Meetings", "Project files"]);
        expect(parts()).toEqual(["Presentation", "3D", "Drawings"]);
        expect(window.location.search).toBe("?tab=files");

        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        expect(await screen.findByText("No 3D files yet")).toBeInTheDocument();
        expect(window.location.search).toContain("part=model");
    });

    it("comes before the Client portal tab, and is on an internal Design project too", async () => {
        const { unmount } = renderApp(page, nadia, ...projectWorkHandlers);
        await screen.findByText("Total hours");
        expect(tabs()).toEqual(["Analytics", "Contributors", "Requirements", "Timeline", "Meetings", "Project files", "Client portal"]);
        unmount();

        // ahead of the fixture's own project, so it answers first
        renderApp(page, nadia, internal, ...projectWorkHandlers);
        await screen.findAllByRole("tab");
        expect(tabs()).toContain("Project files");
        expect(tabs()).not.toContain("Client portal");
    });

    it("isn't on an Execution project, even by link", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}?tab=files`, personas.executionEmployee, ...siteHandlers);
        expect(await screen.findByText("Materials", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Requirements", "Meetings"]);
    });
});

describe("a section's files", () => {
    it("lists the section's files in their order, with who put them there, what goes to the client, their comments and the storage in use", async () => {
        const chosen = { ...hero, forClient: true, comments: { total: 3, open: 1 } };
        const plan = projectFileOf(7, "Ground floor plan", fileOf(13, "plan-ground.pdf", { contentType: "application/pdf", preview: "pdf" }), { section: "drawing" });
        const walk = projectFileOf(8, "Walkthrough", fileOf(14, "walk.mp4", { contentType: "video/mp4", preview: "video" }), { section: "model" });
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([chosen, living, walk, plan], { usage: usageOf(4, 7.5) })), ...projectWorkHandlers);

        expect(await screen.findByText("4 files · 7.5 MB original · 7.5 MB stored")).toBeInTheDocument();
        expect(screen.getByText("Stored size is what the file storage reports; no compression is applied.")).toBeInTheDocument();
        expect(cards()).toEqual(["Hero shot", "Living room v3"]);

        const card = screen.getByRole("article", { name: "Hero shot" });
        expect(within(card).getByText("IMG_0042.jpg")).toBeInTheDocument();
        expect(within(card).getByText("JPG · 1.5 MB")).toBeInTheDocument();
        expect(within(card).getByText("Uploaded by Nadia Karam · Yesterday")).toBeInTheDocument();
        expect(within(card).getByText("For client")).toBeInTheDocument();
        expect(within(card).getByRole("button", { name: "Comments on Hero shot: 3, 1 open" })).toHaveTextContent("3");
        // where a file stands against what clients see is the Client portal's to say
        expect(within(card).queryByText("New")).toBeNull();
        const image = card.querySelector("img")!;
        expect(image).toHaveAttribute("src", "/api/content-store/previews/12");
        expect(image).toHaveAttribute("loading", "lazy");
        expect(image).toHaveAttribute("decoding", "async");
        // a title that is only the file name without its extension doesn't repeat it; a file without comments has no count
        const other = within(screen.getByRole("article", { name: "Living room v3" }));
        expect(other.queryByText("Living room v3.jpg")).toBeNull();
        expect(other.queryByText("For client")).toBeNull();
        expect(other.queryByRole("button", { name: /^Comments on/ })).toBeNull();

        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        const video = (await screen.findByRole("article", { name: "Walkthrough" })).querySelector("video")!;
        expect(video).toHaveAttribute("preload", "metadata");
        expect(video.getAttribute("src")).toContain("/api/content-store/previews/14");

        await userEvent.click(screen.getByRole("tab", { name: "Drawings" }));
        const pdf = await screen.findByRole("article", { name: "Ground floor plan" });
        expect(pdf.querySelector("img, video")).toBeNull();
        expect(within(pdf).getByText("PDF")).toBeInTheDocument();
    });

    it("says what an empty section is for", async () => {
        renderApp(filesPart("model"), nadia, servedFiles(filesOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("No 3D files yet")).toBeInTheDocument();
        expect(screen.getByText(/Upload renders, walkthrough videos or model files\./)).toBeInTheDocument();
    });

    it("says it couldn't load them, and tries again", async () => {
        let asked = 0;
        renderApp(filesPart("presentation"), nadia, ...projectWorkHandlers,
            http.get(filesBase, () => (++asked === 1 ? apiError(403, "forbidden", "Not allowed right now.") : HttpResponse.json(filesOf([living])))));
        expect(await screen.findByText(/Couldn't load the project's files\. Not allowed right now\./)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
    });

    it("replaces a preview link that didn't load once, and keeps the links of the files that did", async () => {
        const one = projectFileOf(41, "First", fileOf(41, "first.jpg"));
        const two = projectFileOf(42, "Second", fileOf(42, "second.jpg"));
        let loads = 0;
        renderApp(filesPart("presentation"), nadia, ...projectWorkHandlers, http.get(filesBase, () => {
            loads++;
            return HttpResponse.json(filesOf([one, two].map((i) => ({ ...i, previewUrl: `${i.previewUrl}?v=${loads}` }))));
        }));
        const first = (await screen.findByRole("article", { name: "First" })).querySelector("img")!;
        expect(first).toHaveAttribute("src", "/api/content-store/previews/41?v=1");

        fireEvent.error(first);
        await waitFor(() => expect(loads).toBe(2));
        // only the link that failed is new: the other file keeps the one it had, so its picture isn't loaded again
        await waitFor(() => expect(screen.getByRole("article", { name: "First" }).querySelector("img")).toHaveAttribute("src", "/api/content-store/previews/41?v=2"));
        expect(screen.getByRole("article", { name: "Second" }).querySelector("img")).toHaveAttribute("src", "/api/content-store/previews/42?v=1");

        // a second failure is not asked about again: the card shows its empty tile
        fireEvent.error(screen.getByRole("article", { name: "First" }).querySelector("img")!);
        await waitFor(() => expect(screen.getByRole("article", { name: "First" }).querySelector("img")).toBeNull());
        expect(loads).toBe(2);
    });
});

describe("what each person may change", () => {
    it("shows an archived project's reason and offers only preview, download and the comments", async () => {
        renderApp(filesPart("presentation"), nadia, ...projectWorkHandlers,
            servedFiles(filesOf([living], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." })));
        expect(await screen.findByText("This project is archived, so its files can't be changed.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
        expect(screen.queryByLabelText("Files to upload")).toBeNull();

        await menuOf("Living room v3");
        expect(menuItems()).toEqual(["Preview", "Download", "Comments"]);
    });

    it("says file storage isn't set up, and offers no upload", async () => {
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([], { storageReady: false })), ...projectWorkHandlers);
        expect(await screen.findByText("File storage for project files isn't set up yet. Ask your administrator.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
        expect(screen.queryByLabelText("Files to upload")).toBeNull();
    });

    it("lets an employee upload, and change only the files she uploaded", async () => {
        const mine = projectFileOf(5, "Mood board", fileOf(11, "Mood board.jpg", { uploadedBy: sarahRef }));
        const theirs = projectFileOf(6, "Kitchen", fileOf(12, "Kitchen.jpg"), { canEdit: false });
        const uploaded = projectFileOf(21, "plan", fileOf(31, "plan.jpg", { originalBytes: 6, storedBytes: 6, uploadedBy: sarahRef }));
        const api = uploadApi(uploaded, usageOf(3, 4));
        renderApp(filesPart("presentation"), sarah, servedFiles(filesOf([mine, theirs], { canManage: false })), ...api.handlers, ...projectWorkHandlers);

        await menuOf("Mood board");
        expect(menuItems()).toEqual(["Preview", "Download", "Comments", "Rename", "Move to 3D", "Move to Drawings", "Replace file", "Delete"]);
        await userEvent.keyboard("{Escape}");
        await menuOf("Kitchen");
        expect(menuItems()).toEqual(["Preview", "Download", "Comments"]);
        await userEvent.keyboard("{Escape}");
        // only a manager rearranges the cards
        expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();

        await userEvent.upload(screen.getByLabelText("Files to upload"), small());
        const card = await screen.findByRole("article", { name: "plan" });
        expect(within(card).getByText("Uploaded by Sarah Haddad · Yesterday")).toBeInTheDocument();
        expect(api.log.started[0]).toMatchObject({ section: "presentation", fileName: "plan.jpg", size: 6 });
    });
});

describe("uploading", () => {
    it("sends a file in parts straight to the storage, without the staff token, and puts its card in the section", async () => {
        const api = uploadApi(planItem, usageOf(3, 2.5));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([living, hero], { usage: usageOf(2, 3.5) })), ...api.handlers, ...projectWorkHandlers);
        expect(await screen.findByText("2 files · 3.5 MB original · 3.5 MB stored")).toBeInTheDocument();

        await userEvent.upload(screen.getByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(screen.getByText("3 files · 2.5 MB original · 2.5 MB stored")).toBeInTheDocument();
        expect(api.log.started).toHaveLength(1);
        expect(api.log.started[0]).toMatchObject({ section: "presentation", fileName: "plan.jpg", size: 6, replaceItemId: null, authorization: "Bearer test-token" });
        expect(typeof api.log.started[0].clientToken).toBe("string");
        expect(api.log.asked).toEqual([[1, 2]]);
        expect(api.log.puts.map((p) => p.part).sort()).toEqual(["p1", "p2"]);
        // the links themselves are the permission: the API's token never goes to the storage
        expect(api.log.puts.map((p) => p.authorization)).toEqual([null, null]);
        expect(api.log.completes).toBe(1);
        await waitFor(() => expect(screen.queryByRole("list", { name: "Uploads" })).toBeNull());
    });

    it("uploads files dropped on the section, which is outlined while they are over it", async () => {
        const api = uploadApi(planItem, usageOf(1, 2.5));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await screen.findByText("No presentation files yet");

        fireEvent.dragEnter(section(), { dataTransfer: { types: ["Files"] } });
        expect(section()).toHaveClass("on");
        expect(screen.getByText("Drop to upload to Presentation")).toBeInTheDocument();
        fireEvent.drop(section(), { dataTransfer: { files: [small()], types: ["Files"] } });
        expect(section()).not.toHaveClass("on");

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.started[0]).toMatchObject({ section: "presentation", fileName: "plan.jpg" });
    });

    it("refuses a file of another type before anything is sent", async () => {
        const api = uploadApi(planItem);
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        const user = userEvent.setup({ applyAccept: false });
        await user.upload(await screen.findByLabelText("Files to upload"), new File(["MZ"], "setup.exe"));

        const row = (await screen.findByText("setup.exe")).closest("li") as HTMLElement;
        expect(within(row).getByText(".exe files can't be added to the project's files.")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
        expect(api.log.started).toEqual([]);
        await user.click(within(row).getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByRole("list", { name: "Uploads" })).toBeNull();
    });

    it("tries a part again, then fails the file; Retry sends only the parts that didn't arrive", async () => {
        const api = uploadApi(planItem);
        let storageDown = true;
        api.put = (name) => (name === "p1" && storageDown ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 200 }));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        const row = (await screen.findByText("plan.jpg")).closest("li") as HTMLElement;
        expect(await within(row).findByText("The file storage refused part 1 (500).")).toBeInTheDocument();
        // the first try and three more
        expect(api.log.puts.filter((p) => p.part === "p1")).toHaveLength(4);
        expect(api.log.completes).toBe(0);

        storageDown = false;
        await userEvent.click(within(row).getByRole("button", { name: "Retry" }));
        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        // the same upload went on: part 2 had arrived and wasn't sent again
        expect(api.log.started).toHaveLength(1);
        expect(api.log.puts.filter((p) => p.part === "p2")).toHaveLength(1);
        expect(api.log.puts.filter((p) => p.part === "p1")).toHaveLength(5);
        expect(api.log.asked).toEqual([[1, 2], [1]]);
    });

    it("sends the parts not confirmed once more when the API says the upload is incomplete", async () => {
        const api = uploadApi(planItem);
        api.complete = (attempt) => (attempt === 1 ? apiError(409, "portal_upload_incomplete", "Not every part arrived.") : HttpResponse.json({ item: planItem, usage: usageOf(1, 2) }));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.completes).toBe(2);
    });

    it("starts again with a new token when the API says the upload ended", async () => {
        const api = uploadApi(planItem);
        let first = true;
        api.parts = () => {
            if (!first) return null;
            first = false;
            return apiError(409, "portal_upload_ended", "This upload has expired.");
        };
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.started).toHaveLength(2);
        expect(api.log.started[0].clientToken).not.toEqual(api.log.started[1].clientToken);
    });

    it("waits and asks again when it is asked to slow down, and never fails the file for it", async () => {
        const api = uploadApi(planItem);
        let slowed = 0;
        api.start = () => (slowed++ < 5 ? apiError(429, "too_many_requests", "Too many requests.") : HttpResponse.json({ uploadId: 7, partSize: 4, partCount: 2 }, { status: 201 }));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.started).toHaveLength(6);
    });

    it("fails a file whose contents aren't what its name says, with nothing to retry", async () => {
        const api = uploadApi(planItem);
        api.complete = () => apiError(400, "portal_file_content_mismatch", "This file isn't a real JPG image.");
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        const row = (await screen.findByText("plan.jpg")).closest("li") as HTMLElement;
        expect(await within(row).findByText("This file isn't a real JPG image.")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
        await userEvent.click(within(row).getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByRole("list", { name: "Uploads" })).toBeNull();
        // the API already removed the upload
        expect(api.log.deleted).toEqual([]);
    });

    it("shows the reason on the file and loads the section again when the project became read-only", async () => {
        const api = uploadApi(planItem);
        api.start = () => apiError(422, "portal_content_read_only", "This project is archived, so its files can't be changed.");
        let loads = 0;
        renderApp(filesPart("presentation"), nadia, ...api.handlers, ...projectWorkHandlers, http.get(filesBase, () => {
            loads++;
            return HttpResponse.json(loads === 1 ? filesOf([]) : filesOf([], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." }));
        }));
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        const row = (await screen.findByText("plan.jpg")).closest("li") as HTMLElement;
        expect(await within(row).findByText("This project is archived, so its files can't be changed.")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
        await waitFor(() => expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull());
        expect(loads).toBe(2);
    });

    it("cancels a file on its way: the parts stop and the API is told", async () => {
        const api = uploadApi(planItem);
        // the storage never answers the first part
        api.put = (name) => (name === "p1" ? new Promise<Response>(() => {}) : new HttpResponse(null, { status: 200 }));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        const row = (await screen.findByText("plan.jpg")).closest("li") as HTMLElement;
        await waitFor(() => expect(api.log.puts.some((p) => p.part === "p1")).toBe(true));
        expect(within(row).getByRole("progressbar", { name: "Progress of plan.jpg" })).toBeInTheDocument();
        // the browser asks before the tab is closed while a file is on its way
        const closing = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(closing);
        expect(closing.defaultPrevented).toBe(true);

        await userEvent.click(within(row).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(api.log.deleted).toEqual(["7"]));
        expect(screen.queryByRole("list", { name: "Uploads" })).toBeNull();
        expect(api.log.completes).toBe(0);
        const closed = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(closed);
        expect(closed.defaultPrevented).toBe(false);
    });

    it("loads the files again once when all the project's files are up, not after each file", async () => {
        UPLOAD_MS.refresh = 0;
        const api = uploadApi(planItem);
        const live = liveFiles(filesOf([]));
        api.complete = () => {
            live.box.files = filesOf([planItem]);
            return HttpResponse.json({ item: planItem, usage: usageOf(1, 2) });
        };
        renderApp(filesPart("presentation"), nadia, live.handler, ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), [small("a.jpg"), small("b.jpg")]);

        await waitFor(() => expect(api.log.completes).toBe(2));
        await waitFor(() => expect(live.box.gets).toBe(2));
        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        // nothing more is asked once the one load is done
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(live.box.gets).toBe(2);
    });

    it("keeps the Client portal's Publish changes off, saying why, while files are on their way", async () => {
        UPLOAD_MS.refresh = 0;
        const api = uploadApi(planItem, usageOf(2, 4));
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        api.put = async (name) => {
            if (name === "p1") await gate;
            return new HttpResponse(null, { status: 200 });
        };
        renderApp(filesPart("presentation"), publisher, servedFiles(filesOf([living])), served(contentOf([itemOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"))])),
            ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        // the uploads carry on in the other tab
        await userEvent.click(screen.getByRole("tab", { name: "Client portal" }));
        const publish = await screen.findByRole("button", { name: "Publish changes" });
        await waitFor(() => expect(publish).toBeDisabled());
        expect(screen.getByText("Publishing waits until the uploads have finished.")).toBeInTheDocument();

        release();
        await waitFor(() => expect(publish).toBeEnabled());
        expect(screen.queryByText("Publishing waits until the uploads have finished.")).toBeNull();
    });

    it("sends a new file for an existing card, which keeps its place", async () => {
        const newer: ProjectFile = { ...living, file: fileOf(32, "Living room v4.jpg", { originalBytes: 6, storedBytes: 6 }), previewUrl: "/api/content-store/previews/32" };
        const api = uploadApi(newer, usageOf(2, 2));
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([living, hero])), ...api.handlers, ...projectWorkHandlers);

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Replace file" }));
        await userEvent.upload(screen.getByLabelText("New file for the card"), small("Living room v4.jpg"));

        await waitFor(() => expect(screen.getByRole("article", { name: "Living room v3" }).querySelector("img")).toHaveAttribute("src", "/api/content-store/previews/32"));
        expect(api.log.started[0]).toMatchObject({ fileName: "Living room v4.jpg", replaceItemId: 5 });
        expect(cards()).toEqual(["Hero shot", "Living room v3"]);
    });
});

describe("a card's menu", () => {
    it("renames a file, telling what is wrong as it is typed", async () => {
        const renamed: unknown[] = [];
        const live = liveFiles(filesOf([living]));
        renderApp(filesPart("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${filesBase}/items/:itemId`, async ({ request }) => {
                const body = (await request.json()) as { title: string };
                renamed.push(body);
                const item = { ...living, title: body.title };
                live.box.files = filesOf([item]);
                return HttpResponse.json(item);
            }));
        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Rename" }));
        const dialog = screen.getByRole("dialog", { name: "Rename" });
        const title = within(dialog).getByLabelText("Title");

        await userEvent.clear(title);
        expect(within(dialog).getByText("Give the file a title.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(renamed).toEqual([]);

        fireEvent.change(title, { target: { value: "x".repeat(201) } });
        expect(within(dialog).getByText("Use at most 200 characters.")).toBeInTheDocument();

        await userEvent.clear(title);
        await userEvent.type(title, "  Hero view ");
        expect(within(dialog).queryByRole("alert")).toBeNull();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        expect(await screen.findByRole("article", { name: "Hero view" })).toBeInTheDocument();
        expect(renamed).toEqual([{ title: "Hero view" }]);
        expect(screen.queryByRole("dialog")).toBeNull();
        // the other cards' places and what a rename changes for clients come from the API: the files are loaded again
        await waitFor(() => expect(live.box.gets).toBe(2));
        expect(screen.getByRole("article", { name: "Hero view" })).toBeInTheDocument();
    });

    it("moves a file to another section", async () => {
        const moved: unknown[] = [];
        const live = liveFiles(filesOf([living, hero]));
        renderApp(filesPart("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${filesBase}/items/:itemId`, async ({ request }) => {
                const body = await request.json();
                moved.push(body);
                const item = { ...living, section: "model" as const, sortOrder: 9 };
                live.box.files = filesOf([item, hero]);
                return HttpResponse.json(item);
            }));
        await menuOf("Living room v3");
        expect(screen.queryByRole("button", { name: "Move to Presentation" })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Move to 3D" }));

        await waitFor(() => expect(cards()).toEqual(["Hero shot"]));
        expect(moved).toEqual([{ section: "model" }]);
        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
    });

    it("asks before deleting, then removes the card and updates the storage line", async () => {
        const deleted: string[] = [];
        const live = liveFiles(filesOf([living, hero], { usage: usageOf(2, 3.5) }));
        renderApp(filesPart("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.delete(`${filesBase}/items/:itemId`, ({ params }) => {
                deleted.push(String(params.itemId));
                live.box.files = filesOf([hero], { usage: usageOf(1, 1.5) });
                return HttpResponse.json({ usage: usageOf(1, 1.5) });
            }));

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        let dialog = screen.getByRole("dialog", { name: "Delete Living room v3?" });
        expect(within(dialog).getByText("The file and its comments are deleted from the project. This can't be undone.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
        expect(deleted).toEqual([]);
        expect(screen.queryByRole("dialog")).toBeNull();

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        dialog = screen.getByRole("dialog", { name: "Delete Living room v3?" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(cards()).toEqual(["Hero shot"]));
        expect(deleted).toEqual(["5"]);
        expect(screen.getByText("1 file · 1.5 MB original · 1.5 MB stored")).toBeInTheDocument();
    });

    it("says deleting a file clients see is only final once published, and then marks it deleted", async () => {
        const settled = { ...living, forClient: true, clientState: "unchanged" as const };
        const live = liveFiles(filesOf([settled]));
        renderApp(filesPart("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.delete(`${filesBase}/items/:itemId`, () => {
                live.box.files = filesOf([{ ...settled, removed: true, clientState: "removed" }]);
                return HttpResponse.json({ usage: usageOf(1, 2) });
            }));

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog", { name: "Delete Living room v3?" });
        expect(within(dialog).getByText(/Clients keep seeing this file until the next publish; then it's removed from what they see\./)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("File removed")).toBeInTheDocument();
        const card = screen.getByRole("article", { name: "Living room v3" });
        expect(within(card).getByText("Deleted — clients see it until the next publish")).toBeInTheDocument();
    });

    it("fades a deleted file clients still see, puts it last and out of reach of the handles, and brings it back with Undo", async () => {
        const gone = projectFileOf(8, "Old render", fileOf(14, "old.jpg"), { removed: true, forClient: true, clientState: "removed", sortOrder: 0 });
        const live = liveFiles(filesOf([living, kitchen, gone]));
        const restored: string[] = [];
        renderApp(filesPart("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.post(`${filesBase}/items/:itemId/restore`, ({ params }) => {
                restored.push(String(params.itemId));
                live.box.files = filesOf([living, kitchen, { ...gone, removed: false, clientState: "unchanged" }]);
                return HttpResponse.json(live.box.files);
            }));

        // last, though its sort order is first
        await screen.findByRole("article", { name: "Old render" });
        expect(cards()).toEqual(["Living room v3", "Kitchen", "Old render"]);
        const card = screen.getByRole("article", { name: "Old render" });
        expect(card).toHaveClass("removed");
        expect(within(card).getByText("Deleted — clients see it until the next publish")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Reorder Old render" })).toBeNull();
        expect(screen.getByRole("button", { name: "Reorder Kitchen" })).toBeInTheDocument();

        // the menu keeps only what is still possible
        await menuOf("Old render");
        expect(menuItems()).toEqual(["Download", "Comments"]);
        await userEvent.keyboard("{Escape}");

        await userEvent.click(within(card).getByRole("button", { name: "Undo" }));
        expect(await screen.findByText("Deletion undone")).toBeInTheDocument();
        expect(restored).toEqual(["8"]);
        await waitFor(() => expect(screen.getByRole("article", { name: "Old render" })).not.toHaveClass("removed"));
        expect(within(screen.getByRole("article", { name: "Old render" })).queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("shows a picture in a window of its own that Escape closes", async () => {
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([living])), ...projectWorkHandlers);
        await menuOf("Living room v3");
        await userEvent.click(inMenu().getByRole("button", { name: "Preview" }));
        const dialog = screen.getByRole("dialog", { name: "Living room v3" });
        expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/api/content-store/previews/11");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("downloads through a short-lived link, and opens a PDF in a new tab that has no way back", async () => {
        const pdf = projectFileOf(7, "Ground floor plan", fileOf(13, "plan-ground.pdf", { contentType: "application/pdf", preview: "pdf" }), { section: "drawing" });
        const asked: string[] = [];
        const followed: { href: string; target: string; rel: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push({ href: this.getAttribute("href") ?? "", target: this.target, rel: this.rel, download: this.download });
        });
        renderApp(filesPart("drawing"), nadia, servedFiles(filesOf([pdf])), ...projectWorkHandlers,
            http.get(`${filesBase}/items/:itemId/link`, ({ request }) => {
                const inline = new URL(request.url).searchParams.get("inline");
                asked.push(String(inline));
                return HttpResponse.json({ url: `/api/content-store/objects/13?inline=${inline}`, expiresAt: "2026-09-30T09:05:00Z" });
            }));

        await menuOf("Ground floor plan");
        await userEvent.click(screen.getByRole("button", { name: "Download" }));
        await waitFor(() => expect(followed).toHaveLength(1));
        expect(followed[0]).toMatchObject({ href: "/api/content-store/objects/13?inline=false", download: "plan-ground.pdf" });

        await menuOf("Ground floor plan");
        await userEvent.click(inMenu().getByRole("button", { name: "Preview" }));
        await waitFor(() => expect(followed).toHaveLength(2));
        expect(followed[1]).toMatchObject({ href: "/api/content-store/objects/13?inline=true", target: "_blank", rel: "noopener" });
        expect(asked).toEqual(["false", "true"]);
    });
});

describe("choosing the client's files", () => {
    it("shows a file to the client and hides it again, for someone with client_portal:manage", async () => {
        const sent: unknown[] = [];
        renderApp(filesPart("presentation"), publisher, servedFiles(filesOf([living], { canChooseForClient: true })), ...projectWorkHandlers,
            http.put(`${filesBase}/items/:itemId/for-client`, async ({ request }) => {
                const body = (await request.json()) as { forClient: boolean };
                sent.push(body);
                return HttpResponse.json({ ...living, forClient: body.forClient, clientState: body.forClient ? "new" : null });
            }));

        await menuOf("Living room v3");
        expect(inMenu().queryByRole("button", { name: "Hide from client" })).toBeNull();
        await userEvent.click(inMenu().getByRole("button", { name: "Show to client" }));
        expect(await screen.findByText("Shown to the client")).toBeInTheDocument();
        expect(within(screen.getByRole("article", { name: "Living room v3" })).getByText("For client")).toBeInTheDocument();

        await menuOf("Living room v3");
        expect(inMenu().queryByRole("button", { name: "Show to client" })).toBeNull();
        await userEvent.click(inMenu().getByRole("button", { name: "Hide from client" }));
        await waitFor(() => expect(within(screen.getByRole("article", { name: "Living room v3" })).queryByText("For client")).toBeNull());
        expect(sent).toEqual([{ forClient: true }, { forClient: false }]);
    });

    it("offers neither to someone without it, who still sees which files go to the client", async () => {
        renderApp(filesPart("presentation"), nadia, servedFiles(filesOf([{ ...living, forClient: true }, kitchen], { canChooseForClient: false })), ...projectWorkHandlers);

        expect(within(await screen.findByRole("article", { name: "Living room v3" })).getByText("For client")).toBeInTheDocument();
        for (const title of ["Living room v3", "Kitchen"]) {
            await menuOf(title);
            expect(inMenu().queryByRole("button", { name: "Show to client" })).toBeNull();
            expect(inMenu().queryByRole("button", { name: "Hide from client" })).toBeNull();
            await userEvent.keyboard("{Escape}");
        }
    });
});
