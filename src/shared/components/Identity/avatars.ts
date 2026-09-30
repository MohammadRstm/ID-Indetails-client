import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";

/*
 * The prototype's avatars: DiceBear "Notionists" (artwork CC0 1.0, code MIT), drawn from the person's name.
 * The same name always gives the same picture, for everyone, so nothing needs storing. An uploaded photo wins.
 */

const TINTS = ["d9ece7", "e3e2f4", "f4e6d7", "dde8f5", "f3e1e6", "e5eed9", "eee6f4", "dcecee"];
const cache = new Map<string, string>();

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export function avatarUri(name: string): string {
    const cached = cache.get(name);
    if (cached) return cached;
    const uri = createAvatar(notionists, {
        seed: name,
        backgroundColor: [TINTS[hash(name) % TINTS.length]],
        radius: 50,
        scale: 96,
        beardProbability: 20,
        glassesProbability: 25,
    }).toDataUri();
    cache.set(name, uri);
    return uri;
}

export function initials(name: string): string {
    const parts = String(name || "").trim().split(/\s+/);
    return ((parts[0] || "")[0] || "") + ((parts[1] || "")[0] || "");
}
