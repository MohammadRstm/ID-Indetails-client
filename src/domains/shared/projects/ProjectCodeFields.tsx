import { FieldError } from "@/shared/components/Forms/Field";
import useDebounce from "@/shared/hooks/useDebounce";
import type { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import { fullCode, projectCodeError, typedCode } from "./projectCodes";
import { useNextProjectCode } from "./projectsApi";

type ProjectCodeFieldsProps = {
    domain: string;
    /** The project being edited: its own code isn't taken. */
    projectId?: number;
    /** What is typed in each. On a new project, one not typed in yet (null) shows its suggestion. */
    projectCode: string | null;
    buildingCode: string | null;
    /** A new project: the building code suggested from its name, shown with the API's next project code until typed over. */
    suggestedBuildingCode?: string;
    onProjectCode: (code: string) => void;
    onBuildingCode: (code: string) => void;
    projectCodeError: string | false;
    buildingCodeError: string | false;
    /** The API's refusal of the project code at saving, shown under it until it changes. */
    refused?: string;
    errors: ReturnType<typeof useFormErrors>;
};

/** The project form's codes: the project code (ID26Q4001) and the building code (VK), with the full code they make. */
export default function ProjectCodeFields(props: ProjectCodeFieldsProps) {
    const { domain, projectId, projectCode, buildingCode, suggestedBuildingCode, errors } = props;
    const suggesting = suggestedBuildingCode !== undefined;
    // who has the code typed, asked once the typing pauses on a whole code
    const typed = useDebounce({ value: projectCode ?? "", debounceTimeMs: 300 });
    const check = typed && !projectCodeError(typed) ? typed : "";
    const next = useNextProjectCode(domain, check, projectId ?? null);
    const takenBy = check && check === projectCode && !next.isPlaceholderData ? next.data?.takenBy : null;
    const suggested = next.data?.projectCode;

    const shownProject = projectCode ?? suggested ?? "";
    const shownBuilding = buildingCode ?? suggestedBuildingCode ?? "";
    const projectError = errors.show("projectCode", props.projectCodeError) ?? props.refused;
    const buildingError = errors.show("buildingCode", props.buildingCodeError);

    return (
        <div className="grid g-2 mt">
            <div className="field">
                <label className="label required" htmlFor="pc-project">Project code</label>
                <input id="pc-project" className="input mono" maxLength={9} placeholder={suggesting ? "ID26Q4001" : undefined}
                    value={shownProject} onChange={(e) => props.onProjectCode(typedCode(e.target.value))} onBlur={errors.touch("projectCode")} />
                {projectError ? <FieldError message={projectError} />
                    : takenBy ? (
                        <div className="err" role="alert">
                            <Icon name="alert" />
                            <span>
                                {projectCode} is already the code of {takenBy.title}.
                                {suggested && <> <span className="link" {...clickable(() => props.onProjectCode(suggested), "button")}>Use {suggested}</span></>}
                            </span>
                        </div>
                    )
                        : <div className="hint">{suggesting && projectCode == null ? "The next code of this quarter. You can change it." : "ID, the year, Q and the quarter, then its number."}</div>}
            </div>
            <div className="field">
                <label className="label required" htmlFor="pc-building">Building code</label>
                <input id="pc-building" className="input mono" maxLength={10} placeholder={suggesting ? "Initials of the name" : undefined}
                    value={shownBuilding} onChange={(e) => props.onBuildingCode(typedCode(e.target.value))} onBlur={errors.touch("buildingCode")} />
                {buildingError ? <FieldError message={buildingError} />
                    : <div className="hint">{shownProject && shownBuilding ? <>Full code <b className="mono">{fullCode(shownProject, shownBuilding)}</b></> : "Usually the initials of the name."}</div>}
            </div>
        </div>
    );
}
