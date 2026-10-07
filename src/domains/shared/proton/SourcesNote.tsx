import type { ProtonSource } from "./protonApi";

const periodOf = (s: ProtonSource) =>
    [s.period && `${s.period}${s.partial ? " (so far)" : ""}`, s.comparedWith && `vs ${s.comparedWith}`].filter(Boolean).join(" ");

/** What an analytical answer rests on: the days compared, the scope, and anything left out and why. */
export default function SourcesNote({ sources }: { sources: ProtonSource[] }) {
    if (sources.length === 0) return null;
    const [first] = sources;
    return (
        <details className="proton-sources">
            <summary>
                Based on: {first.label}{periodOf(first) && ` · ${periodOf(first)}`}{sources.length > 1 && ` · +${sources.length - 1} more`}
            </summary>
            <ul>
                {sources.map((s) => (
                    <li key={`${s.label}|${s.period}|${s.comparedWith}`}>
                        <b>{s.label}</b>{periodOf(s) && ` · ${periodOf(s)}`}{s.scope && <span className="muted"> · {s.scope}</span>}
                        {s.omitted.length > 0 && <div className="muted">Not included: {s.omitted.join("; ")}</div>}
                    </li>
                ))}
            </ul>
        </details>
    );
}
