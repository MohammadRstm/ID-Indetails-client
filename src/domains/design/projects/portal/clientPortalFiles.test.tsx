import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { filesBase, filesOf, projectFileOf, servedFiles, uploadApi } from "./filesTestKit";
import { base, cards, contentOf, fileOf, itemOf, liveContent, menuItems, menuOf, page, part, person, projectId, publisher, served, usageOf } from "./portalTestKit";
import { resetUploads, UPLOAD_MS } from "./uploads";

// the preview of what clients would get is another component's, with its own tests
vi.mock("./PresentationPreview", () => ({
    default: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Preview"><button onClick={onClose}>Close preview</button></div>,
}));

/*
 * The Client portal tab's files: the parts each person gets, the files chosen for the client as read-only cards, who
 * may change and publish them, the hero image's uploads, and the way to Project files, where the files are chosen.
 */

const nadia = personas.designAdmin;
const rana = personas.superAdmin;

const published = { publishedAt: "2026-10-14T12:20:00Z", publishedBy: person };
const living = itemOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"));
const kitchen = itemOf(6, "Kitchen", fileOf(12, "Kitchen.jpg"), { state: "unchanged" });

const parts = () => within(screen.getByRole("tablist", { name: "Client portal" })).getAllByRole("tab").map((t) => t.textContent);
const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const clients = http.get("/api/projects/:id/portal/clients", () => HttpResponse.json({ projectId, cannotInviteReason: null, clients: [] }));
const small = (name: string) => new File(["abcdef"], name, { type: "image/jpeg" });

// Wednesday 30 September 2026, noon in Beirut
const waits = { retry: [...UPLOAD_MS.retry], done: UPLOAD_MS.done, refresh: UPLOAD_MS.refresh };
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    // a finished upload leaves the list at once, and the files aren't loaded again after it
    UPLOAD_MS.retry = [0, 0, 0];
    UPLOAD_MS.done = 0;
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
    it("leaves client_portal:manage to the super admin, and gives the Design admin project_files:manage", () => {
        expect(personas.superAdmin.permissions).toContain(P.CLIENT_PORTAL_MANAGE);
        expect(personas.designAdmin.permissions).not.toContain(P.CLIENT_PORTAL_MANAGE);
        expect(personas.executionAdmin.permissions).not.toContain(P.CLIENT_PORTAL_MANAGE);
        expect(personas.superAdmin.permissions).toContain(P.PROJECT_FILES_MANAGE);
        expect(personas.designAdmin.permissions).toContain(P.PROJECT_FILES_MANAGE);
        expect(personas.executionAdmin.permissions).not.toContain(P.PROJECT_FILES_MANAGE);
        expect(personas.designEmployee.permissions).not.toContain(P.PROJECT_FILES_MANAGE);
    });

    it("gives the Design admin, who invites the client, the three sections to look at and the client access, and keeps the choice in the link", async () => {
        renderApp(`${page}?tab=portal`, nadia, served(contentOf([], { canManage: false })), clients, ...projectWorkHandlers);
        expect(await screen.findByText("No presentation files for the client yet")).toBeInTheDocument();
        expect(tabs()).toContain("Client portal");
        expect(parts()).toEqual(["Presentation", "3D", "Drawings", "Client access"]);
        expect(screen.getByRole("tab", { name: "Presentation" })).toHaveAttribute("aria-selected", "true");

        await userEvent.click(screen.getByRole("tab", { name: "3D" }));
        expect(await screen.findByText("No 3D files for the client yet")).toBeInTheDocument();
        expect(window.location.search).toContain("part=model");

        await userEvent.click(screen.getByRole("tab", { name: "Client access" }));
        expect(await screen.findByText("Client portal access")).toBeInTheDocument();
        expect(window.location.search).toContain("part=access");
    });

    it("opens the part the link names", async () => {
        renderApp(part("drawing"), nadia, served(contentOf([], { canManage: false })), ...projectWorkHandlers);
        expect(await screen.findByText("No drawings for the client yet")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Drawings" })).toHaveAttribute("aria-selected", "true");
    });

    it("gives someone with only client_portal:manage the three sections, even when the link asks for the access", async () => {
        renderApp(part("access"), withPermissions(nadia, { grant: [P.CLIENT_PORTAL_MANAGE], revoke: [P.CLIENT_ACCESS_MANAGE] }), served(contentOf([])), ...projectWorkHandlers);
        expect(await screen.findByText("No presentation files for the client yet")).toBeInTheDocument();
        expect(parts()).toEqual(["Presentation", "3D", "Drawings"]);
        expect(screen.queryByText("Client portal access")).toBeNull();
    });

    it("isn't there on an internal project, whatever the person holds", async () => {
        // ahead of the fixture's own project, so it answers first
        renderApp(page, publisher, http.get("/api/projects/:id", () => HttpResponse.json({ ...projectWork.project, billingType: "internal", client: null })), ...projectWorkHandlers);
        await screen.findAllByRole("tab");
        expect(tabs()).not.toContain("Client portal");
    });
});

describe("the files chosen for the client", () => {
    it("shows only them, as read-only cards that say where each stands, without uploads, the storage line or handles", async () => {
        renderApp(part("presentation"), publisher, served(contentOf([living, kitchen], { publication: published })), ...projectWorkHandlers);

        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
        expect(cards()).toEqual(["Living room v3", "Kitchen"]);
        expect(within(screen.getByRole("article", { name: "Living room v3" })).getByText("New")).toBeInTheDocument();
        expect(within(screen.getByRole("article", { name: "Kitchen" })).getByText("Published")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
        expect(screen.queryByLabelText("Files to upload")).toBeNull();
        expect(screen.queryByText(/ original · /)).toBeNull();
        expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();

        await menuOf("Living room v3");
        expect(menuItems()).toEqual(["Preview", "Download", "Remove from client"]);
    });

    it("takes a file off the client's files with Remove from client: clients see it until the next publish", async () => {
        const live = liveContent(contentOf([living, kitchen], { publication: published }));
        const sent: unknown[] = [];
        renderApp(part("presentation"), publisher, live.handler, ...projectWorkHandlers,
            http.put(`${filesBase}/items/:itemId/for-client`, async ({ request, params }) => {
                sent.push({ itemId: String(params.itemId), ...((await request.json()) as object) });
                live.box.content = contentOf([living, { ...kitchen, state: "removed" }], { publication: published });
                return HttpResponse.json(projectFileOf(6, "Kitchen", fileOf(12, "Kitchen.jpg"), { clientState: "removed" }));
            }));

        await menuOf("Kitchen");
        await userEvent.click(screen.getByRole("button", { name: "Remove from client" }));

        expect(await screen.findByText("Hidden from the client")).toBeInTheDocument();
        expect(sent).toEqual([{ itemId: "6", forClient: false }]);
        const card = within(screen.getByRole("article", { name: "Kitchen" }));
        expect(await card.findByText("Removed — clients see it until you publish")).toBeInTheDocument();
        expect(card.getByText("Removed")).toBeInTheDocument();
        await menuOf("Kitchen");
        expect(menuItems()).toEqual(["Download"]);
    });

    it("is read-only for an admin without client_portal:manage: nothing to publish, choose or write, and nothing is said to be locked", async () => {
        const hero = { fileId: 11, name: "Living room v3.jpg", url: "/api/content-store/previews/11", urlExpiresAt: "2030-01-01T00:00:00Z" };
        renderApp(part("presentation"), nadia, served(contentOf([living], { canManage: false, hero, summary: "Welcome home." })), ...projectWorkHandlers);

        expect(await screen.findByText("Not published yet")).toBeInTheDocument();
        expect(screen.getByText("· 1 unpublished change")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
        for (const name of ["Publish changes", "Discard changes", "Upload hero image", "Choose from images", "Remove hero", "Save"]) {
            expect(screen.queryByRole("button", { name })).toBeNull();
        }
        // the hero and the introduction can be read
        expect(screen.getByAltText("Hero image")).toBeInTheDocument();
        expect(screen.getByText("Welcome home.")).toBeInTheDocument();
        expect(screen.queryByLabelText("Introduction for the client")).toBeNull();
        expect(screen.queryByLabelText("Hero image to upload")).toBeNull();
        expect(screen.queryByText("The files of this project can't be changed.")).toBeNull();

        await menuOf("Living room v3");
        expect(menuItems()).toEqual(["Preview", "Download"]);
    });

    it("lets the super admin publish", async () => {
        const live = liveContent(contentOf([living]));
        const sent: unknown[] = [];
        renderApp(part("presentation"), rana, live.handler, ...projectWorkHandlers,
            http.post(`${base}/publish`, async ({ request }) => {
                sent.push(await request.json());
                live.box.content = contentOf([{ ...living, state: "unchanged" }], { publication: published, revision: 8 });
                return HttpResponse.json(live.box.content);
            }));

        await userEvent.click(await screen.findByRole("button", { name: "Publish changes" }));
        await userEvent.click(within(screen.getByRole("dialog", { name: "Publish to your client?" })).getByRole("button", { name: "Publish changes" }));

        expect(await screen.findByText("Published. Clients now see this version.")).toBeInTheDocument();
        expect(sent).toEqual([{ expectedRevision: 7 }]);
        expect(await screen.findByText("· Everything is published")).toBeInTheDocument();
    });

    it("says what isn't chosen yet, and leads to Project files, where it is chosen", async () => {
        renderApp(part("presentation"), publisher, served(contentOf([])), ...projectWorkHandlers,
            servedFiles(filesOf([projectFileOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"))], { canChooseForClient: true })));

        expect(await screen.findByText("No presentation files for the client yet")).toBeInTheDocument();
        expect(screen.getByText("Choose the client's files in Project files, with Show to client.")).toBeInTheDocument();
        const link = screen.getByRole("link", { name: "Open Project files" });
        expect(link).toHaveAttribute("href", `${page}?tab=files&part=presentation`);

        await userEvent.click(link);
        expect(await screen.findByRole("tab", { name: "Project files" })).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByRole("article", { name: "Living room v3" })).toBeInTheDocument();
    });
});

describe("the hero image's uploads", () => {
    it("go to the project's files as uploads that belong to no section, and show once the client portal says so", async () => {
        const api = uploadApi(null, usageOf(2, 4));
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        api.put = async (name) => {
            if (name === "p1") await gate;
            return new HttpResponse(null, { status: 200 });
        };
        const live = liveContent(contentOf([living]));
        // the API answers a hero upload without an item; the client portal then names the hero
        api.complete = () => {
            live.box.content = contentOf([living], {
                hero: { fileId: 40, name: "banner.jpg", url: "/api/content-store/previews/40", urlExpiresAt: "2026-09-30T10:00:00Z" },
                changes: { heroChanged: true },
            });
            return HttpResponse.json({ item: null, usage: usageOf(2, 4) });
        };
        renderApp(part("presentation"), publisher, live.handler, ...api.handlers, ...projectWorkHandlers);
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

    it("refuse a picture of a type that can't be the hero, before anything is sent", async () => {
        const api = uploadApi(null);
        renderApp(part("presentation"), publisher, served(contentOf([])), ...api.handlers, ...projectWorkHandlers);
        const user = userEvent.setup({ applyAccept: false });
        await user.upload(await screen.findByLabelText("Hero image to upload"), new File(["GIF89a"], "banner.gif", { type: "image/gif" }));

        const row = (await screen.findByText("banner.gif")).closest("li") as HTMLElement;
        expect(within(row).getByText(".gif files can't be the hero image. Use a JPG, PNG or WebP picture.")).toBeInTheDocument();
        expect(api.log.started).toEqual([]);
    });
});
