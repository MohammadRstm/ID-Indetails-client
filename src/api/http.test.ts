import { http as mock, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { ApiError } from "./errors";
import { configureSession, http, refreshSession } from "./http";
import { tokenStore } from "./tokenStore";

const auth = (token: string) => ({ accessToken: token, accessTokenExpiresAt: "2026-09-30T12:00:00Z", user: { id: 1 } });

afterEach(() => tokenStore.set(null));

describe("http", () => {
    it("sends the access token", async () => {
        tokenStore.set("abc");
        server.use(mock.get("/api/ping", ({ request }) => HttpResponse.json({ auth: request.headers.get("authorization") })));

        const { data } = await http.get("/ping");

        expect(data.auth).toBe("Bearer abc");
    });

    it("refreshes once on a 401, repeats the request, and shares one refresh between requests", async () => {
        tokenStore.set("old");
        let refreshes = 0;
        server.use(
            mock.get("/api/ping", ({ request }) =>
                request.headers.get("authorization") === "Bearer new"
                    ? HttpResponse.json({ ok: true })
                    : HttpResponse.json({ code: "unauthenticated" }, { status: 401 })),
            mock.post("/api/auth/refresh", () => {
                refreshes++;
                return HttpResponse.json(auth("new"));
            }),
        );
        const onRefreshed = vi.fn();
        configureSession({ onRefreshed, onExpired: vi.fn() });

        const results = await Promise.all([http.get("/ping"), http.get("/ping"), http.get("/ping")]);

        expect(results.every((r) => r.data.ok)).toBe(true);
        expect(refreshes).toBe(1);
        expect(onRefreshed).toHaveBeenCalledTimes(1);
        expect(tokenStore.get()).toBe("new");
    });

    it("reports an expired session when the refresh fails", async () => {
        tokenStore.set("old");
        server.use(
            mock.get("/api/ping", () => HttpResponse.json({ code: "unauthenticated" }, { status: 401 })),
            mock.post("/api/auth/refresh", () => HttpResponse.json({ code: "refresh_token_invalid" }, { status: 401 })),
        );
        const onExpired = vi.fn();
        configureSession({ onRefreshed: vi.fn(), onExpired });

        await expect(http.get("/ping")).rejects.toBeInstanceOf(ApiError);
        expect(onExpired).toHaveBeenCalledTimes(1);
        expect(tokenStore.get()).toBeNull();
    });

    it("keeps the session when the refresh itself fails, and fails only that request", async () => {
        tokenStore.set("old");
        server.use(
            mock.get("/api/ping", () => HttpResponse.json({ code: "unauthenticated" }, { status: 401 })),
            mock.post("/api/auth/refresh", () => HttpResponse.json({ code: "rate_limited", message: "Too many requests." }, { status: 429 })),
        );
        const onExpired = vi.fn();
        configureSession({ onRefreshed: vi.fn(), onExpired });

        const error = await http.get("/ping").catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(429);
        expect(onExpired).not.toHaveBeenCalled();
        expect(tokenStore.get()).toBe("old");
    });

    it("turns the API's error body into an ApiError with field errors", async () => {
        server.use(mock.post("/api/things", () => HttpResponse.json({
            type: "validation",
            code: "validation_failed",
            message: "One or more fields are invalid.",
            errors: { "Name": ["Name is required."], "$.startedAt": ["The value is invalid."] },
        }, { status: 400 })));

        const error = await http.post("/things", {}).catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(400);
        expect(error.code).toBe("validation_failed");
        expect(error.fieldErrors).toEqual({ name: "Name is required.", startedAt: "The value is invalid." });
    });

    it("says there is no session to restore when the refresh cookie is missing", async () => {
        server.use(mock.post("/api/auth/refresh", () => HttpResponse.json({ code: "refresh_token_invalid" }, { status: 401 })));

        await expect(refreshSession()).resolves.toBeNull();
    });
});
