import { Navigate, useSearchParams } from "react-router";

/** /company/website?tab=services, from before the website had its own area, opens /website/services. */
export default function MovedWebsite() {
    const [params] = useSearchParams();
    return <Navigate to={`/website/${params.get("tab") ?? "projects"}`} replace />;
}
