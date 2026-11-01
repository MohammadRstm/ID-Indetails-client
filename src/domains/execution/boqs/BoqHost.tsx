import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import type { Project } from "../../shared/projects/projectsApi";
import { useBoqAccess } from "./boqAccess";
import { useBoqLinks } from "./boqLinks";
import { useBoq } from "./boqsApi";
import BoqSheet from "./BoqSheet";

/**
 * The BOQ the link asks for (?boq=12), for whoever may read BOQs on this site: an Execution site with a client. The
 * API answers 404 to an internal draft that isn't theirs.
 */
export default function BoqHost({ project }: { project: Project }) {
    const access = useBoqAccess(project);
    const links = useBoqLinks();
    if (links.id == null || project.domain !== "execution" || project.billingType !== "client" || !project.client || !access.seesBoqs) return null;
    return <BoqLoader key={links.id} project={project} id={links.id} onClose={links.close} />;
}

function BoqLoader({ project, id, onClose }: { project: Project; id: number; onClose: () => void }) {
    const boq = useBoq(project.id, id);
    if (boq.data) return <BoqSheet key={boq.data.id} project={project} boq={boq.data} onClose={onClose} />;
    return (
        <Modal size="md" title="BOQ" sub={project.title} onClose={onClose} foot={<button className="btn" onClick={onClose}>Close</button>}>
            {loadFailed(boq) ? <LoadError error={boq.error} retry={() => boq.refetch()} what="the BOQ" /> : <SkeletonLines lines={6} />}
        </Modal>
    );
}
