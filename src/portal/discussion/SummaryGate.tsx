import type { ReactNode } from "react";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { useDiscussionSummary, type Discussion } from "./discussionApi";
import type { DiscussionSummary } from "./discussionTypes";

type Props = {
    discussion: Discussion;
    projectId: number;
    children: (summary: DiscussionSummary) => ReactNode;
};

/** The discussion's pieces all need its summary (who takes part, whether it can be written to): this loads it and hands it on. */
export default function SummaryGate({ discussion, projectId, children }: Props) {
    const summary = useDiscussionSummary(discussion, projectId);
    if (summary.data) return <>{children(summary.data)}</>;
    if (loadFailed(summary)) return <LoadError error={summary.error} what="the discussion" retry={() => void summary.refetch()} />;
    return <SkeletonLines lines={6} />;
}
