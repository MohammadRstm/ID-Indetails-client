import { http } from "@/api/http";
import type { Discussion } from "@/portal/discussion/discussionApi";

/** The staff's side of a project's discussion: the staff instance and token (the portal never imports this). */
export const staffDiscussion: Discussion = {
    side: "staff",
    http,
    base: (projectId) => `/projects/${projectId}/portal/discussion`,
};
