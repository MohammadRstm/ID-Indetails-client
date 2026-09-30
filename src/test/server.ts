import { setupServer } from "msw/node";

/** The mock API every test talks to. Tests add their own handlers with `server.use(...)`. */
export const server = setupServer();
