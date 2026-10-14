import { Link, useSearchParams } from "react-router";
import ChatPanel from "@/portal/discussion/ChatPanel";
import CommentThreadPanel from "@/portal/discussion/CommentThreadPanel";
import CommentThreadsList from "@/portal/discussion/CommentThreadsList";
import SummaryGate from "@/portal/discussion/SummaryGate";
import Panel from "@/shared/components/Data/Panel";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import { staffDiscussion } from "./staffDiscussion";

/**
 * The Client portal tab's Discussion part: the project's chat with the client's contacts on the left (above on narrow
 * screens) and the comments they and the team wrote on files on the right. A link with ?item={id} opens that file's
 * comments in place of the list, with a way back. Whoever takes part sees it, whatever their permissions.
 */
export default function DiscussionPart({ project }: { project: Project }) {
    const [params, setParams] = useSearchParams();
    const itemParam = Number(params.get("item"));
    const itemId = Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null;

    function openItem(next: number) {
        const link = new URLSearchParams(params);
        link.set("item", String(next));
        setParams(link);
    }

    // the same link without the file: back to the list
    const back = new URLSearchParams(params);
    back.delete("item");

    return (
        <SummaryGate discussion={staffDiscussion} projectId={project.id}>
            {(summary) => (
                <div className="dp-split">
                    <Panel title="Project chat" sub="The client's contacts and the team write here. Everyone in the discussion sees it." flush bodyClassName="dp-pane">
                        <ChatPanel discussion={staffDiscussion} projectId={project.id} summary={summary} />
                    </Panel>
                    <Panel title={itemId == null ? "Comments on files" : "Comments"} flush bodyClassName="dp-pane"
                        sub={itemId == null ? "Every file clients have commented on, newest first." : undefined}
                        tools={itemId != null && (
                            <Link className="btn btn-sm btn-quiet" to={{ search: back.toString() }}><Icon name="chevronLeft" />All comments</Link>
                        )}>
                        {itemId == null
                            ? <CommentThreadsList threads={summary.threads} onOpen={openItem} />
                            : <CommentThreadPanel key={itemId} discussion={staffDiscussion} projectId={project.id} itemId={itemId} summary={summary} />}
                    </Panel>
                </div>
            )}
        </SummaryGate>
    );
}
