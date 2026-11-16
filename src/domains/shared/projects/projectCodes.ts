/*
 * A project's codes, as the API's ProjectCodeRules has them: the project code is ID, the year, Q and the quarter,
 * then 3 digits (ID26Q4001), and the building code is 1 to 10 letters or digits, usually the name's initials (VK).
 * The form only suggests and checks them as they are typed; the API decides.
 */

const PROJECT_CODE = /^ID\d{2}Q[1-4]\d{3}$/;
const BUILDING_CODE = /^[A-Z0-9]{1,10}$/;
const MAX_BUILDING_CODE = 10;

/** Not counted in the initials. "A" is: it is a block's name as often as a word. */
const SKIPPED = new Set(["of", "the", "and", "an", "de", "du", "des", "la", "le", "el", "al"]);

/** A code as it is typed: in capitals, without spaces. */
export function typedCode(value: string) {
    return value.toUpperCase().replace(/\s/g, "");
}

/**
 * The building code suggested for a name, the one the API gives when none is sent: each word's first letter without
 * its accent, or the whole of a number, in capitals, up to 10. "Villa Kadmous" is VK, "Mila 2 Concrete" M2C.
 */
export function buildingCodeOf(title: string) {
    const initials = (title.match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((word) => !SKIPPED.has(word.toLowerCase()))
        .map((word) => word.match(/^\p{Nd}+/u)?.[0] ?? word[0].normalize("NFD")[0])
        .join("")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    return initials.slice(0, MAX_BUILDING_CODE) || "X";
}

export function projectCodeError(code: string) {
    if (!code) return "Give the project its code, such as ID26Q4001.";
    return !PROJECT_CODE.test(code) && "Use the form ID26Q4001: ID, the year, Q and the quarter, then 3 digits.";
}

export function buildingCodeError(code: string) {
    if (!code) return "Give it a building code, usually the name's initials.";
    return !BUILDING_CODE.test(code) && "Use 1 to 10 letters (A to Z) or digits.";
}

/** A project as the pickers list it: its full code, then its name. */
export function projectLabel(project: { title: string; code?: string | null }) {
    return project.code ? `${project.code} · ${project.title}` : project.title;
}

/** The full code: ID26Q4001-VK. */
export function fullCode(projectCode: string, buildingCode: string) {
    return `${projectCode}-${buildingCode}`;
}
