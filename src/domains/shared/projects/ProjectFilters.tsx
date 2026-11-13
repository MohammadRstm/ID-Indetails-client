import type { ReactNode } from "react";
import { ChipGroup, ChoiceList } from "@/shared/components/Forms/Filters";
import { Drawer } from "@/shared/components/Overlays/Modal";
import { STATUS_LABEL, TYPE_LABEL, type ProjectFilterValues } from "./projectFilters";
import type { ProjectStatus } from "./projectsApi";

type Option = { value: string; label: string };

type ProjectFiltersProps = {
    values: ProjectFilterValues;
    onChange: (patch: Partial<ProjectFilterValues>) => void;
    /** Turns every filter off. */
    onClear: () => void;
    onClose: () => void;
    /** How many projects each status has, once known. */
    counts: Record<ProjectStatus | "all", number | undefined>;
    years: number[];
    /** Client work or internal: for whoever sees the money, on Design. */
    showType: boolean;
    /** The clients to choose from, or null for someone who may not see clients. */
    clients: Option[] | null;
    /** The people to choose from as owners, or null for someone who may not see people. */
    owners: Option[] | null;
    /** How many projects the filters leave, once known. */
    matching: number | undefined;
    anyOn: boolean;
};

const STATUSES: (ProjectStatus | "all")[] = ["all", "active", "hold", "completed", "archived"];

function Group({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="fgroup">
            <h3 className="fgroup-title">{title}</h3>
            {children}
        </section>
    );
}

/**
 * The projects list's filters, all in one place: a panel that opens from the Filters button, grouped (status, time, type,
 * client, owner) and scrolling when it is long. A choice narrows the list behind it at once.
 */
export default function ProjectFiltersDrawer({ values, onChange, onClear, onClose, counts, years, showType, clients, owners, matching, anyOn }: ProjectFiltersProps) {
    return (
        <Drawer title="Filters" onClose={onClose}
            foot={
                <>
                    <button type="button" className="btn btn-quiet" disabled={!anyOn} onClick={onClear}>Clear filters</button>
                    <div className="grow" />
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        {matching == null ? "Done" : `Show ${matching} project${matching === 1 ? "" : "s"}`}
                    </button>
                </>
            }>
            <Group title="Status">
                <ChipGroup aria-label="Status" value={values.status} onChange={(status) => onChange({ status })}
                    options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] }))} />
            </Group>

            <Group title="When">
                <ChipGroup aria-label="Quarter" value={values.quarter ? String(values.quarter) : "any"}
                    onChange={(q) => onChange({ quarter: q === "any" ? null : +q })}
                    options={[{ value: "any", label: "Any time" }, ...[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }))]} />
                {values.quarter ? (
                    <div className="fgroup-row">
                        <ChipGroup aria-label="Year" value={String(values.year)} onChange={(year) => onChange({ year: +year })}
                            options={years.map((y) => ({ value: String(y), label: String(y) }))} />
                    </div>
                ) : null}
                <div className="hint fgroup-row">A quarter matches any project that was open during it.</div>
            </Group>

            {showType && (
                <Group title="Type">
                    <ChipGroup aria-label="Type" value={values.type} onChange={(type) => onChange({ type })}
                        options={(["all", "client", "internal"] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
                </Group>
            )}

            {clients && (
                <Group title="Client">
                    <ChoiceList aria-label="Client" findLabel="Find a client" value={values.client} onChange={(client) => onChange({ client })} options={clients} />
                </Group>
            )}

            {owners && (
                <Group title="Owner">
                    <ChoiceList aria-label="Owner" findLabel="Find a person" value={values.owner} onChange={(owner) => onChange({ owner })} options={owners} />
                </Group>
            )}
        </Drawer>
    );
}
