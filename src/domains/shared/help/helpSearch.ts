import { termScore, words } from "@/app/shell/searchPlaces";
import type { HelpFacts } from "./helpFacts";
import { plainText, type Article, type HelpContext } from "./helpModel";

export type HelpHit = { article: Article; score: number };

/**
 * The articles that fit what was typed, best first, with the search's own matching (plurals, typos, words in any
 * order). A title or one of the ways people ask scores in full; a match only somewhere in the text scores less.
 */
export function searchHelp(articles: Article[], query: string, ctx: HelpContext, facts: HelpFacts): HelpHit[] {
    const all = words(query);
    // a question is mostly little words: "how do I change the address" is about "change address"
    const meaningful = all.filter((w) => !LITTLE.has(w));
    const typed = meaningful.length ? meaningful : all;
    if (typed.length === 0) return [];
    return articles
        .map((article) => {
            const named = Math.max(...[article.title, ...article.ask].map((t) => termScore(typed, words(t))));
            // every word once is enough to know whether the text mentions them all
            const body = [...new Set(words(plainText(article, ctx, facts)))];
            const mentioned = termScore(typed, body) * 0.6;
            return { article, score: Math.max(named, mentioned) };
        })
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score);
}

/** Words that carry no meaning in a question, made by words() the way a query is ("this" becomes "thi"). */
const LITTLE = new Set(words(
    "a an the i me my we our us you your it its this that there here how what where when why who which do does did is are was be " +
    "can could should would will to of for in on at by with from and or about please get",
));
