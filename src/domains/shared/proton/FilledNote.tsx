/** What Proton filled in a form: the person checks it and saves it themselves. */
export default function FilledNote({ fields }: { fields: string[] }) {
    if (fields.length === 0) return null;
    return (
        <div className="proton-filled" role="status">
            Filled by Proton: {fields.join(", ")}. Check {fields.length === 1 ? "it" : "them"}, then save.
        </div>
    );
}
