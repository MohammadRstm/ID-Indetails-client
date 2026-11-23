import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * The mock API every test talks to. Tests add their own handlers with `server.use(...)`, which come first. The few here
 * answer what many pages ask in passing: no month is reopened for logging unless a test says so.
 */
export const server = setupServer(
    http.get("/api/reopened-months", () => HttpResponse.json([])),
);
