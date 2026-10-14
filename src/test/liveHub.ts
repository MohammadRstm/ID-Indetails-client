/*
 * A stand-in for @microsoft/signalr in tests (set up in setup.ts): connections "open" at once, and a test
 * sends the API's signals with live.emit("notifications") or live.emit("messages", { teamId: 4 }). live.drop() and
 * live.restore() lose and win back every open connection, as a break in the network would.
 */

type Handler = (...args: unknown[]) => void;
type Lifecycle = "reconnecting" | "reconnected" | "close";

export const HubConnectionState = { Disconnected: "Disconnected", Connected: "Connected", Reconnecting: "Reconnecting" } as const;

export const LogLevel = { None: 6 };

const open = new Set<FakeConnection>();

class FakeConnection {
    state: string = HubConnectionState.Disconnected;
    url: string;
    private handlers = new Map<string, Handler[]>();
    private lifecycle = new Map<Lifecycle, Handler[]>();

    constructor(url: string) {
        this.url = url;
    }

    on(signal: string, handler: Handler) {
        this.handlers.set(signal, [...(this.handlers.get(signal) ?? []), handler]);
    }

    onreconnecting(handler: Handler) {
        this.listen("reconnecting", handler);
    }

    onreconnected(handler: Handler) {
        this.listen("reconnected", handler);
    }

    onclose(handler: Handler) {
        this.listen("close", handler);
    }

    private listen(event: Lifecycle, handler: Handler) {
        this.lifecycle.set(event, [...(this.lifecycle.get(event) ?? []), handler]);
    }

    start() {
        this.state = HubConnectionState.Connected;
        open.add(this);
        return Promise.resolve();
    }

    stop() {
        this.state = HubConnectionState.Disconnected;
        open.delete(this);
        return Promise.resolve();
    }

    emit(signal: string, payload?: unknown) {
        // a connection that is down hears nothing
        if (this.state !== HubConnectionState.Connected) return;
        this.handlers.get(signal)?.forEach((h) => (payload === undefined ? h() : h(payload)));
    }

    drop() {
        this.state = HubConnectionState.Reconnecting;
        this.lifecycle.get("reconnecting")?.forEach((h) => h());
    }

    restore() {
        this.state = HubConnectionState.Connected;
        this.lifecycle.get("reconnected")?.forEach((h) => h());
    }
}

export class HubConnectionBuilder {
    private url = "";
    withUrl(url: string) { this.url = url; return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() { return new FakeConnection(this.url); }
}

export const live = {
    /** Sends a signal to every open connection, as the API's hub would. */
    emit(signal: string, payload?: unknown) {
        open.forEach((c) => c.emit(signal, payload));
    },
    get connected() {
        return open.size;
    },
    /** The address of each open connection, to tell the staff hub from the portal's. */
    get urls() {
        return [...open].map((c) => c.url);
    },
    /** Every open connection is lost (and tries again). */
    drop() {
        open.forEach((c) => c.drop());
    },
    /** Every lost connection is back. */
    restore() {
        open.forEach((c) => c.restore());
    },
};
