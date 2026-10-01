/** While the session is restored: the prototype's boot spinner. */
export default function BootScreen() {
    return (
        <div className="boot" aria-busy="true">
            <div className="boot-mark" aria-hidden="true" />
            <p className="boot-text">Loading ID InDetails…</p>
        </div>
    );
}
