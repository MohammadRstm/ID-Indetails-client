import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { anonymous } from "@/api/http";
import type { AuthResponse } from "@/api/types";
import { useSession } from "@/app/session/useSession";
import { FieldError } from "@/shared/components/Forms/Field";

/*
 * Development only: signs in as any account that can sign in, without its password, through the API's development
 * sign-in (which exists only when the API runs in its Development environment). The sign-in page loads this file only
 * in the Vite dev server (see DevAccountPicker in app/routing/pages.ts), so a production build doesn't contain it.
 * Its endpoints are left out of the API's OpenAPI document, so their shapes are written here.
 */

type DevAccount = { kind: "staff" | "client"; id: number; name: string; email: string; detail: string | null };
type DevAccounts = { groups: { label: string; accounts: DevAccount[] }[] };

/** The last account picked, so the next sign-in is one click. */
const LAST_PICKED = "hourline-dev-sign-in";

const keyOf = (account: Pick<DevAccount, "kind" | "id">) => `${account.kind}:${account.id}`;

function lastPicked(): string {
    try {
        return localStorage.getItem(LAST_PICKED) ?? "";
    } catch {
        return "";
    }
}

function remember(key: string) {
    try {
        localStorage.setItem(LAST_PICKED, key);
    } catch {
        // only a convenience
    }
}

export default function DevAccountPicker() {
    const { adopt } = useSession();
    const navigate = useNavigate();
    const accounts = useQuery({
        queryKey: ["dev", "accounts"],
        queryFn: () => anonymous<DevAccounts>("get", "/dev/accounts"),
        retry: false,
        staleTime: Infinity,
    });
    const [picked, setPicked] = useState(lastPicked);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const account = accounts.data?.groups.flatMap((g) => g.accounts).find((a) => keyOf(a) === picked);

    async function signIn() {
        if (!account) return;
        setBusy(true);
        setError(undefined);
        remember(keyOf(account));
        try {
            if (account.kind === "client") {
                await anonymous("post", "/dev/portal-sign-in", { accountId: account.id });
                // the portal restores its session from the cookie just set
                window.location.assign("/portal");
                return;
            }
            adopt(await anonymous<AuthResponse>("post", "/dev/sign-in", { userId: account.id }));
            navigate("/", { replace: true });
        } catch (failure) {
            setError(errorMessage(failure));
            setBusy(false);
        }
    }

    return (
        <div className="stack" style={{ gap: 8, padding: 12, border: "1px dashed var(--line)", borderRadius: 10 }}>
            <div className="label">Development only: sign in as</div>
            {accounts.isError ? (
                <p className="hint">The accounts didn't load. The API has to run in its Development environment.</p>
            ) : (
                <div className="row" style={{ gap: 8 }}>
                    <select
                        className="select grow"
                        aria-label="Account to sign in as"
                        value={account ? picked : ""}
                        disabled={!accounts.data || busy}
                        onChange={(e) => setPicked(e.target.value)}
                    >
                        <option value="">{accounts.data ? "Choose an account…" : "Loading accounts…"}</option>
                        {accounts.data?.groups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                                {group.accounts.map((a) => (
                                    <option key={keyOf(a)} value={keyOf(a)}>{`${a.name} · ${a.detail ?? a.email}`}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <button type="button" className="btn btn-ghost" disabled={!account || busy} onClick={() => void signIn()}>
                        {busy ? "Signing in…" : "Sign in as"}
                    </button>
                </div>
            )}
            <FieldError message={error} />
        </div>
    );
}
