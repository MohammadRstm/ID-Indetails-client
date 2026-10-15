import { portalHttp } from "../portalApi";
import type { Discussion } from "./discussionApi";

/** The client's side of a project's discussion: the portal's own instance and token. */
export const clientDiscussion: Discussion = {
    side: "client",
    http: portalHttp,
    base: (projectId) => `/projects/${projectId}/discussion`,
};
