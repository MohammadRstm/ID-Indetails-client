import Empty from "@/shared/components/Feedback/Empty";

/** Stands in for a screen until its phase of docs/build-plan.md lands. */
export default function ComingSoon({ title }: { title: string }) {
    return (
        <div className="page">
            <div className="page-head">
                <div className="grow">
                    <h1 className="page-title">{title}</h1>
                </div>
            </div>
            <Empty art="projects" title="On its way" text="This screen is still being built." />
        </div>
    );
}
