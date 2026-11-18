import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const project = fixtures.project;
const uploaded = { id: 60, name: "villa.webp", mimeType: "image/webp", kind: "image", sizeBytes: 10, createdAt: "2026-09-30T09:00:00Z" };

/** The photo calls: the upload, setting it on the project and taking it off, with what each was sent. */
function photoApi(photoFileId: number | null = null) {
    const calls: { call: string; body?: unknown }[] = [];
    const handlers = [
        http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, photoFileId })),
        http.post("/api/files", () => { calls.push({ call: "upload" }); return HttpResponse.json(uploaded, { status: 201 }); }),
        // the type said in the header, as the API sends it: a Blob body doesn't carry its type through the test browser
        http.get("/api/files/:id", () => new HttpResponse("x", { headers: { "Content-Type": "image/webp" } })),
        http.put(`/api/projects/${project.id}/photo`, async ({ request }) => {
            const body = await request.json();
            calls.push({ call: "PUT", body });
            photoFileId = (body as { fileId: number }).fileId;
            return HttpResponse.json({ ...project, photoFileId });
        }),
        http.delete(`/api/projects/${project.id}/photo`, () => {
            calls.push({ call: "DELETE" });
            photoFileId = null;
            return HttpResponse.json({ ...project, photoFileId });
        }),
    ];
    return { calls, handlers };
}

describe("a project's photo", () => {
    // files are shown from object URLs, which the test browser doesn't make
    beforeEach(() => { URL.createObjectURL = vi.fn(() => "blob:photo"); });

    it("is chosen from the device in the project's details and set on the project", async () => {
        const api = photoApi();
        renderApp(`/design/projects/${project.id}?about=1`, admin, ...api.handlers, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Project photo" }));
        // no photo yet: there is nothing to take off
        expect(screen.queryByRole("button", { name: "Take the photo off" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Choose a photo" }));
        await userEvent.upload(screen.getByLabelText("Project photo file"), new File(["x"], "villa.jpg", { type: "image/jpeg" }));
        await waitFor(() => expect(api.calls).toEqual([{ call: "upload" }, { call: "PUT", body: { fileId: 60 } }]));
        expect(await screen.findByText("Photo changed")).toBeInTheDocument();
    });

    it("shows instead of the icon tile, and can be taken off", async () => {
        const api = photoApi(60);
        renderApp(`/design/projects/${project.id}?about=1`, admin, ...api.handlers, ...projectHandlers);
        const button = await screen.findByRole("button", { name: "Project photo" });
        await waitFor(() => expect(button.querySelector(".ptile-photo img")).not.toBeNull());
        await userEvent.click(button);
        expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Take the photo off" }));
        await waitFor(() => expect(api.calls).toEqual([{ call: "DELETE" }]));
        expect(await screen.findByText("Photo taken off")).toBeInTheDocument();
    });

    describe("placed in its square", () => {
        // jsdom opens no pictures and draws nothing: a wide photo, and a canvas that writes the square
        beforeEach(() => {
            vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2000, height: 1000, close: vi.fn() })));
            URL.revokeObjectURL = vi.fn();
            vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), imageSmoothingQuality: "low" } as never);
            vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["square"], { type: "image/webp" })));
        });
        afterEach(() => {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        it("is placed before it goes up: dragged and zoomed in a square like the tile", async () => {
            const api = photoApi();
            renderApp(`/design/projects/${project.id}?about=1`, admin, ...api.handlers, ...projectHandlers);
            await userEvent.click(await screen.findByRole("button", { name: "Project photo" }));
            await userEvent.click(screen.getByRole("button", { name: "Choose a photo" }));
            await userEvent.upload(screen.getByLabelText("Project photo file"), new File(["x"], "villa.jpg", { type: "image/jpeg" }));

            const placing = await screen.findByRole("dialog", { name: "Position the photo" });
            expect(placing.querySelector(".photo-pos-mask.square")).not.toBeNull();
            // nothing goes up until the photo is placed
            expect(api.calls).toEqual([]);
            await userEvent.click(within(placing).getByRole("button", { name: "Use this photo" }));
            await waitFor(() => expect(api.calls).toEqual([{ call: "upload" }, { call: "PUT", body: { fileId: 60 } }]));
            expect(await screen.findByText("Photo changed")).toBeInTheDocument();
        });

        it("already on the project, is moved: opened again, placed and put back", async () => {
            const api = photoApi(60);
            renderApp(`/design/projects/${project.id}?about=1`, admin, ...api.handlers, ...projectHandlers);
            await userEvent.click(await screen.findByRole("button", { name: "Project photo" }));
            await userEvent.click(screen.getByRole("button", { name: "Move the photo" }));

            const placing = await screen.findByRole("dialog", { name: "Position the photo" });
            await userEvent.click(within(placing).getByRole("button", { name: "Use this photo" }));
            await waitFor(() => expect(api.calls).toEqual([{ call: "upload" }, { call: "PUT", body: { fileId: 60 } }]));
            expect(await screen.findByText("Photo moved")).toBeInTheDocument();
        });

        it("is left as it was when the placing is cancelled", async () => {
            const api = photoApi(60);
            renderApp(`/design/projects/${project.id}?about=1`, admin, ...api.handlers, ...projectHandlers);
            await userEvent.click(await screen.findByRole("button", { name: "Project photo" }));
            await userEvent.click(screen.getByRole("button", { name: "Move the photo" }));
            const placing = await screen.findByRole("dialog", { name: "Position the photo" });
            await userEvent.click(within(placing).getByRole("button", { name: "Cancel" }));
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Position the photo" })).not.toBeInTheDocument());
            expect(api.calls).toEqual([]);
        });
    });

    it("is only changed by whoever edits projects: an employee sees the tile alone", async () => {
        const api = photoApi(60);
        renderApp(`/design/projects/${project.id}?about=1`, personas.designEmployee, ...api.handlers, ...projectHandlers);
        expect(await screen.findByRole("dialog", { name: "Project details" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Project photo" })).not.toBeInTheDocument();
    });
});
