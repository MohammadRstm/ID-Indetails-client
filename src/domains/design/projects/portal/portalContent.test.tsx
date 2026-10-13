import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { PortalContentItem, PortalUsage } from "./contentApi";
import { apiError, base, cards, contentOf, fileOf, itemOf, inMenu, liveContent, MB, menuOf, page, part, projectId, served, usageOf } from "./portalTestKit";
import { resetUploads, UPLOAD_MS } from "./uploads";

// the preview of what clients would get is another component's, with its own tests
vi.mock("./PresentationPreview", () => ({
    default: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Preview"><button onClick={onClose}>Close preview</button></div>,
}));

/*
 * A Design client project's Client portal tab: the parts to choose from, and a section's files with their uploads.
 * Part links in the mock API are relative (/api/content-store/parts/p1), as the API gives them in development.
 */

const nadia = personas.designAdmin;

const living = itemOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"));
const hero = itemOf(6, "Hero shot", fileOf(12, "IMG_0042.jpg", { originalBytes: 1.5 * MB, storedBytes: 1.5 * MB }), { sortOrder: 1 });

const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const parts = () => within(screen.getAllByRole("tablist")[1]).getAllByRole("tab").map((t) => t.textContent);
const section = () => document.querySelector(".pc-drop") as HTMLElement;
const small = (name = "plan.jpg") => new File(["abcdef"], name, { type: "image/jpeg" });

/** How the mock API answers; a test changes one of them. */
type Answers = {
    start: () => Response;
    /** null: the usual links. */
    parts: () => Response | null;
    put: (part: string, attempt: number) => Response | Promise<Response>;
    complete: (attempt: number) => Response;
};

/** The mock of one upload: two parts of four bytes, sent to relative part links. */
function uploadApi(uploaded: PortalContentItem, usage: PortalUsage) {
    const log = {
        started: [] as Record<string, unknown>[],
        asked: [] as number[][],
        puts: [] as { part: string; attempt: number; authorization: string | null }[],
        completes: 0,
        deleted: [] as string[],
    };
    const attempts = new Map<string, number>();
    const api: Answers & { log: typeof log; handlers: RequestHandler[] } = {
        log,
        start: () => HttpResponse.json({ uploadId: 7, partSize: 4, partCount: 2 }, { status: 201 }),
        parts: () => null,
        put: () => new HttpResponse(null, { status: 200 }),
        complete: () => HttpResponse.json({ item: uploaded, usage }),
        handlers: [],
    };
    api.handlers = [
        http.post(`${base}/uploads`, async ({ request }) => {
            log.started.push({ ...((await request.json()) as Record<string, unknown>), authorization: request.headers.get("authorization") });
            return api.start();
        }),
        http.post(`${base}/uploads/:uploadId/parts`, async ({ request }) => {
            const { partNumbers } = (await request.json()) as { partNumbers: number[] };
            log.asked.push(partNumbers);
            return api.parts() ?? HttpResponse.json({
                parts: partNumbers.map((n) => ({ partNumber: n, url: `/api/content-store/parts/p${n}` })),
                expiresAt: "2026-09-30T10:00:00Z",
            });
        }),
        http.put("/api/content-store/parts/:part", ({ request, params }) => {
            const name = String(params.part);
            const attempt = (attempts.get(name) ?? 0) + 1;
            attempts.set(name, attempt);
            log.puts.push({ part: name, attempt, authorization: request.headers.get("authorization") });
            return api.put(name, attempt);
        }),
        http.post(`${base}/uploads/:uploadId/complete`, () => api.complete(++log.completes)),
        http.delete(`${base}/uploads/:uploadId`, ({ params }) => {
            log.deleted.push(String(params.uploadId));
            return new HttpResponse(null, { status: 204 });
        }),
    ];
    return api;
}

const planItem = itemOf(21, "plan", fileOf(31, "plan.jpg", { originalBytes: 6, storedBytes: 6 }));

// Wednesday 30 September 2026, noon in Beirut
const waits = { retry: [...UPLOAD_MS.retry], done: UPLOAD_MS.done, refresh: UPLOAD_MS.refresh };
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    // no waiting between a part's tries, and a finished file leaves the list at once
    UPLOAD_MS.retry = [0, 0, 0];
    UPLOAD_MS.done = 0;
    // the drafts aren't loaded again after the last file, unless a test wants that
    UPLOAD_MS.refresh = 60_000;
});
afterEach(() => {
    vi.useRealTimers();
    resetUploads();
    UPLOAD_MS.retry = waits.retry;
    UPLOAD_MS.done = waits.done;
    UPLOAD_MS.refresh = waits.refresh;
});

describe("the Client portal tab's parts, by permission", () => {
    const clients = http.get("/api/projects/:id/portal/clients", () => HttpResponse.json({ projectId, cannotInviteReason: null, clients: [] }));

    it("holds client_portal:manage for the Design admin and the super admin, not the Execution admin", () => {
        expect(personas.designAdmin.permissions).toContain(P.CLIENT_PORTAL_MANAGE);
        expect(personas.superAdmin.permissions).toContain(P.CLIENT_PORTAL_MANAGE);
        expect(personas.executionAdmin.permissions).not.toContain(P.CLIENT_PORTAL_MANAGE);
    });

    it("gives the Design admin the three sections and the client access, and keeps the choice in the link", async () => {
        renderApp(`${page}?tab=portal`, nadia, served(contentOf([])), clients, ...projectWorkHandlers);
        expect(await screen.findByText("No presentation files yet")).toBeInTheDocument();
        expect(tabs()).toContain("Client portal");
        expect(parts()).toEqual(["Presentation", "3D", "Drawings", "Client access"]);
        expect(screen.getByRole("tab", { name: "Presentation" })).toHaveAttribute("aria-selected", "true");

        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        expect(await screen.findByText("No 3D files yet")).toBeInTheDocument();
        expect(window.location.search).toContain("part=model");

        await userEvent.click(screen.getByRole("tab", { name: "Client access" }));
        expect(await screen.findByText("Client portal access")).toBeInTheDocument();
        expect(window.location.search).toContain("part=access");
    });

    it("opens the part the link names", async () => {
        renderApp(part("drawing"), nadia, served(contentOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("No drawings yet")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Drawings" })).toHaveAttribute("aria-selected", "true");
    });

    it("gives someone with only client_access:manage the client access alone", async () => {
        renderApp(`${page}?tab=portal`, withPermissions(nadia, { revoke: [P.CLIENT_PORTAL_MANAGE] }), clients, ...projectWorkHandlers);
        expect(await screen.findByText("Client portal access")).toBeInTheDocument();
        expect(tabs()).toContain("Client portal");
        for (const name of ["Presentation", "3D", "Drawings"]) expect(screen.queryByRole("tab", { name })).toBeNull();
    });

    it("gives someone with only client_portal:manage the three sections, even when the link asks for the access", async () => {
        renderApp(part("access"), withPermissions(nadia, { revoke: [P.CLIENT_ACCESS_MANAGE] }), served(contentOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("No presentation files yet")).toBeInTheDocument();
        expect(parts()).toEqual(["Presentation", "3D", "Drawings"]);
        expect(screen.queryByText("Client portal access")).toBeNull();
    });

    it("isn't there on an internal project, whatever the person holds", async () => {
        // ahead of the fixture's own project, so it answers first
        renderApp(page, withPermissions(nadia, { revoke: [P.CLIENT_ACCESS_MANAGE] }), http.get("/api/projects/:id", () => HttpResponse.json({ ...projectWork.project, billingType: "internal", client: null })), ...projectWorkHandlers);
        await screen.findAllByRole("tab");
        expect(tabs()).not.toContain("Client portal");
    });
});

describe("a section's files", () => {
    it("lists the section's files in their order, with who put them there and the storage in use", async () => {
        const plan = itemOf(7, "Ground floor plan", fileOf(13, "plan-ground.pdf", { contentType: "application/pdf", preview: "pdf" }), { section: "drawing" });
        const walk = itemOf(8, "Walkthrough", fileOf(14, "walk.mp4", { contentType: "video/mp4", preview: "video" }), { section: "model" });
        renderApp(part("presentation"), nadia, served(contentOf([hero, living, walk, plan], { usage: usageOf(4, 7.5) })), ...projectWorkHandlers);

        expect(await screen.findByText("4 files · 7.5 MB original · 7.5 MB stored")).toBeInTheDocument();
        expect(screen.getByText("Stored size is what the file storage reports; no compression is applied.")).toBeInTheDocument();
        expect(cards()).toEqual(["Hero shot", "Living room v3"]);

        const card = screen.getByRole("article", { name: "Hero shot" });
        expect(within(card).getByText("IMG_0042.jpg")).toBeInTheDocument();
        expect(within(card).getByText("JPG · 1.5 MB")).toBeInTheDocument();
        expect(within(card).getByText("Uploaded by Nadia Karam · Yesterday")).toBeInTheDocument();
        expect(within(card).getByText("New")).toBeInTheDocument();
        const image = card.querySelector("img")!;
        expect(image).toHaveAttribute("src", "/api/content-store/previews/12");
        expect(image).toHaveAttribute("loading", "lazy");
        expect(image).toHaveAttribute("decoding", "async");
        // a title that is only the file name without its extension doesn't repeat it
        expect(within(screen.getByRole("article", { name: "Living room v3" })).queryByText("Living room v3.jpg")).toBeNull();

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
        renderApp(part("model"), nadia, served(contentOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("No 3D files yet")).toBeInTheDocument();
        expect(screen.getByText(/Upload renders, walkthrough videos or model files\./)).toBeInTheDocument();
    });

    it("says it couldn't load them, and tries again", async () => {
        let asked = 0;
        renderApp(part("presentation"), nadia, ...projectWorkHandlers,
            http.get(base, () => (++asked === 1 ? apiError(403, "forbidden", "Not allowed right now.") : HttpResponse.json(contentOf([living])))));
        expect(await screen.findByText(/Couldn't load the client portal files\. Not allowed right now\./)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
    });

    it("replaces a preview link that didn't load once, and keeps the links of the files that did", async () => {
        const one = itemOf(41, "First", fileOf(41, "first.jpg"));
        const two = itemOf(42, "Second", fileOf(42, "second.jpg"));
        let loads = 0;
        renderApp(part("presentation"), nadia, ...projectWorkHandlers, http.get(base, () => {
            loads++;
            return HttpResponse.json(contentOf([one, two].map((i) => ({ ...i, previewUrl: `${i.previewUrl}?v=${loads}` }))));
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

describe("the files a person may not change", () => {
    it("shows an archived project's reason and offers only preview and download", async () => {
        renderApp(part("presentation"), nadia, ...projectWorkHandlers,
            served(contentOf([living], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." })));
        expect(await screen.findByText("This project is archived, so its files can't be changed.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
        expect(screen.queryByLabelText("Files to upload")).toBeNull();

        await menuOf("Living room v3");
        expect(inMenu().getByRole("button", { name: "Preview" })).toBeInTheDocument();
        expect(inMenu().getByRole("button", { name: "Download" })).toBeInTheDocument();
        for (const name of ["Rename", "Move to 3D", "Move to Drawings", "Replace file", "Use as hero image", "Move earlier", "Move to start", "Delete"]) {
            expect(screen.queryByRole("button", { name })).toBeNull();
        }
    });

    it("says file storage isn't set up, and offers no upload", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([], { storageReady: false })), ...projectWorkHandlers);
        expect(await screen.findByText("File storage for the client portal isn't set up yet. Ask your administrator.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
        expect(screen.queryByLabelText("Files to upload")).toBeNull();
    });
});

describe("uploading", () => {
    it("sends a file in parts straight to the storage, without the staff token, and puts its card in the section", async () => {
        const api = uploadApi(planItem, usageOf(3, 2.5));
        renderApp(part("presentation"), nadia, served(contentOf([living, hero], { usage: usageOf(2, 3.5) })), ...api.handlers, ...projectWorkHandlers);
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
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
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
        const api = uploadApi(planItem, usageOf(1, 2));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        const user = userEvent.setup({ applyAccept: false });
        await user.upload(await screen.findByLabelText("Files to upload"), new File(["MZ"], "setup.exe"));

        const row = (await screen.findByText("setup.exe")).closest("li") as HTMLElement;
        expect(within(row).getByText(".exe files can't be added to the client portal.")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
        expect(api.log.started).toEqual([]);
        await user.click(within(row).getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByRole("list", { name: "Uploads" })).toBeNull();
    });

    it("tries a part again, then fails the file; Retry sends only the parts that didn't arrive", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        let storageDown = true;
        api.put = (name) => (name === "p1" && storageDown ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 200 }));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
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
        const api = uploadApi(planItem, usageOf(1, 2));
        api.complete = (attempt) => (attempt === 1 ? apiError(409, "portal_upload_incomplete", "Not every part arrived.") : HttpResponse.json({ item: planItem, usage: usageOf(1, 2) }));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.completes).toBe(2);
    });

    it("starts again with a new token when the API says the upload ended", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        let first = true;
        api.parts = () => {
            if (!first) return null;
            first = false;
            return apiError(409, "portal_upload_ended", "This upload has expired.");
        };
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.started).toHaveLength(2);
        expect(api.log.started[0].clientToken).not.toEqual(api.log.started[1].clientToken);
    });

    it("waits and asks again when it is asked to slow down, and never fails the file for it", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        let slowed = 0;
        api.start = () => (slowed++ < 5 ? apiError(429, "too_many_requests", "Too many requests.") : HttpResponse.json({ uploadId: 7, partSize: 4, partCount: 2 }, { status: 201 }));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        expect(api.log.started).toHaveLength(6);
    });

    it("fails a file whose contents aren't what its name says, with nothing to retry", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        api.complete = () => apiError(400, "portal_file_content_mismatch", "This file isn't a real JPG image.");
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
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
        const api = uploadApi(planItem, usageOf(1, 2));
        api.start = () => apiError(422, "portal_content_read_only", "This project is archived, so its files can't be changed.");
        let loads = 0;
        renderApp(part("presentation"), nadia, ...api.handlers, ...projectWorkHandlers, http.get(base, () => {
            loads++;
            return HttpResponse.json(loads === 1 ? contentOf([]) : contentOf([], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." }));
        }));
        await userEvent.upload(await screen.findByLabelText("Files to upload"), small());

        const row = (await screen.findByText("plan.jpg")).closest("li") as HTMLElement;
        expect(await within(row).findByText("This project is archived, so its files can't be changed.")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Retry" })).toBeNull();
        await waitFor(() => expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull());
        expect(loads).toBe(2);
    });

    it("cancels a file on its way: the parts stop and the API is told", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        // the storage never answers the first part
        api.put = (name) => (name === "p1" ? new Promise<Response>(() => {}) : new HttpResponse(null, { status: 200 }));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
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

    it("loads the drafts again once when all the project's files are up, not after each file", async () => {
        UPLOAD_MS.refresh = 0;
        const api = uploadApi(planItem, usageOf(1, 2));
        const live = liveContent(contentOf([]));
        api.complete = () => {
            live.box.content = contentOf([planItem]);
            return HttpResponse.json({ item: planItem, usage: usageOf(1, 2) });
        };
        renderApp(part("presentation"), nadia, live.handler, ...api.handlers, ...projectWorkHandlers);
        await userEvent.upload(await screen.findByLabelText("Files to upload"), [small("a.jpg"), small("b.jpg")]);

        await waitFor(() => expect(api.log.completes).toBe(2));
        await waitFor(() => expect(live.box.gets).toBe(2));
        expect(await screen.findByRole("article", { name: "plan" })).toBeInTheDocument();
        // nothing more is asked once the one load is done
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(live.box.gets).toBe(2);
    });

    it("keeps Publish changes off, saying why, while files are on their way", async () => {
        UPLOAD_MS.refresh = 0;
        const api = uploadApi(planItem, usageOf(2, 4));
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        api.put = async (name) => {
            if (name === "p1") await gate;
            return new HttpResponse(null, { status: 200 });
        };
        const live = liveContent(contentOf([living]));
        api.complete = () => {
            live.box.content = contentOf([living, planItem]);
            return HttpResponse.json({ item: planItem, usage: usageOf(2, 4) });
        };
        renderApp(part("presentation"), nadia, live.handler, ...api.handlers, ...projectWorkHandlers);
        const publish = await screen.findByRole("button", { name: "Publish changes" });
        expect(publish).toBeEnabled();

        await userEvent.upload(screen.getByLabelText("Files to upload"), small());
        await waitFor(() => expect(publish).toBeDisabled());
        expect(screen.getByText("Publishing waits until the uploads have finished.")).toBeInTheDocument();

        release();
        await waitFor(() => expect(publish).toBeEnabled());
        expect(screen.queryByText("Publishing waits until the uploads have finished.")).toBeNull();
    });

    it("sends a hero image as an upload that belongs to no section, and shows it once the drafts say so", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        api.put = async (name) => {
            if (name === "p1") await gate;
            return new HttpResponse(null, { status: 200 });
        };
        const live = liveContent(contentOf([living]));
        // the API answers a hero upload without an item; the drafts then name the hero
        api.complete = () => {
            live.box.content = contentOf([living], {
                hero: { fileId: 40, name: "banner.jpg", url: "/api/content-store/previews/40", urlExpiresAt: "2026-09-30T10:00:00Z" },
                changes: { heroChanged: true },
            });
            return HttpResponse.json({ item: null, usage: usageOf(2, 4) });
        };
        renderApp(part("presentation"), nadia, live.handler, ...api.handlers, ...projectWorkHandlers);
        expect(await screen.findByText("No hero image yet")).toBeInTheDocument();

        await userEvent.upload(screen.getByLabelText("Hero image to upload"), small("banner.jpg"));
        const row = (await screen.findByText("banner.jpg")).closest("li") as HTMLElement;
        expect(within(row).getByText(/^Hero image · /)).toBeInTheDocument();
        release();

        expect(await screen.findByAltText("Hero image")).toHaveAttribute("src", "/api/content-store/previews/40");
        expect(screen.getByText("Changed since last publish")).toBeInTheDocument();
        expect(api.log.started[0]).toMatchObject({ hero: true, fileName: "banner.jpg", size: 6 });
        expect(api.log.started[0]).not.toHaveProperty("section");
        expect(api.log.started[0]).not.toHaveProperty("replaceItemId");
    });

    it("refuses a hero image of a type that can't be one, before anything is sent", async () => {
        const api = uploadApi(planItem, usageOf(1, 2));
        renderApp(part("presentation"), nadia, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        const user = userEvent.setup({ applyAccept: false });
        await user.upload(await screen.findByLabelText("Hero image to upload"), new File(["GIF89a"], "banner.gif", { type: "image/gif" }));

        const row = (await screen.findByText("banner.gif")).closest("li") as HTMLElement;
        expect(within(row).getByText(".gif files can't be the hero image. Use a JPG, PNG or WebP picture.")).toBeInTheDocument();
        expect(api.log.started).toEqual([]);
    });

    it("sends a new file for an existing card, which keeps its place", async () => {
        const newer = { ...living, file: fileOf(32, "Living room v4.jpg", { originalBytes: 6, storedBytes: 6 }), previewUrl: "/api/content-store/previews/32" };
        const api = uploadApi(newer, usageOf(2, 2));
        renderApp(part("presentation"), nadia, served(contentOf([living, hero])), ...api.handlers, ...projectWorkHandlers);

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
        const live = liveContent(contentOf([living]));
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${base}/items/:itemId`, async ({ request }) => {
                const body = (await request.json()) as { title: string };
                renamed.push(body);
                const item = { ...living, title: body.title };
                live.box.content = contentOf([item]);
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
        // what a rename changes for clients (new, changed) comes from the API: the drafts are loaded again
        await waitFor(() => expect(live.box.gets).toBe(2));
        expect(screen.getByRole("article", { name: "Hero view" })).toBeInTheDocument();
    });

    it("moves a file to another section", async () => {
        const moved: unknown[] = [];
        const live = liveContent(contentOf([living, hero]));
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.put(`${base}/items/:itemId`, async ({ request }) => {
                const body = await request.json();
                moved.push(body);
                const item = { ...living, section: "model" as const, sortOrder: 9 };
                live.box.content = contentOf([item, hero]);
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
        const live = liveContent(contentOf([living, hero], { usage: usageOf(2, 3.5) }));
        renderApp(part("presentation"), nadia, live.handler, ...projectWorkHandlers,
            http.delete(`${base}/items/:itemId`, ({ params }) => {
                deleted.push(String(params.itemId));
                live.box.content = contentOf([hero], { usage: usageOf(1, 1.5) });
                return HttpResponse.json({ usage: usageOf(1, 1.5) });
            }));

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        let dialog = screen.getByRole("dialog", { name: "Delete Living room v3?" });
        expect(within(dialog).getByText("The file is removed from the client portal drafts. This can't be undone.")).toBeInTheDocument();
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

    it("shows a picture in a window of its own that Escape closes", async () => {
        renderApp(part("presentation"), nadia, served(contentOf([living])), ...projectWorkHandlers);
        await menuOf("Living room v3");
        await userEvent.click(inMenu().getByRole("button", { name: "Preview" }));
        const dialog = screen.getByRole("dialog", { name: "Living room v3" });
        expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/api/content-store/previews/11");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("downloads through a short-lived link, and opens a PDF in a new tab that has no way back", async () => {
        const pdf = itemOf(7, "Ground floor plan", fileOf(13, "plan-ground.pdf", { contentType: "application/pdf", preview: "pdf" }), { section: "drawing" });
        const asked: string[] = [];
        const followed: { href: string; target: string; rel: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            followed.push({ href: this.getAttribute("href") ?? "", target: this.target, rel: this.rel, download: this.download });
        });
        renderApp(part("drawing"), nadia, served(contentOf([pdf])), ...projectWorkHandlers,
            http.get(`${base}/items/:itemId/link`, ({ request }) => {
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
