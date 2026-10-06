import { Link } from "react-router";
import { useCurrentUser } from "@/app/session/useSession";
import { Banner } from "@/shared/components/Data/Bits";
import Icon from "@/shared/icons/Icon";
import { ARTICLE_BY_ID } from "./content";
import type { HelpFacts } from "./helpFacts";
import { helpPath, resolveLink } from "./helpLinks";
import { CATEGORIES, textOf, visibleBlocks, type Article, type HelpContext, type Text } from "./helpModel";
import { rich } from "./richText";

type Props = { article: Article; ctx: HelpContext; facts: HelpFacts };

/** One Help article, with what this reader may see and the links they may follow. */
export default function HelpArticle({ article, ctx, facts }: Props) {
    const me = useCurrentUser();
    const t = (text: Text) => rich(textOf(text, facts));
    const related = (article.related ?? []).map((id) => ARTICLE_BY_ID.get(id)).filter((a): a is Article => !!a && a.who(ctx));

    return (
        <article className="panel help-article" aria-labelledby={`help-${article.id}`}>
            <div className="panel-head">
                <div className="grow" style={{ minWidth: 0 }}>
                    <div className="u">{CATEGORIES[article.category]}</div>
                    <h2 className="help-title" id={`help-${article.id}`}>{article.title}</h2>
                    <p className="help-summary">{t(article.summary)}</p>
                </div>
            </div>
            <div className="panel-body help-body">
                {visibleBlocks(article.blocks, ctx).map((block, i) => {
                    switch (block.kind) {
                        case "p":
                            return <p key={i}>{t(block.text)}</p>;
                        case "list":
                            return <ul key={i} className="help-list">{block.items.map((item, j) => <li key={j}>{t(item)}</li>)}</ul>;
                        case "steps":
                            return (
                                <ol key={i} className="help-steps">
                                    {block.steps.map((s, j) => (
                                        <li key={j}>
                                            {s.where && <span className="help-where">{s.where.join(" › ")}</span>}
                                            <span>{t(s.text)}</span>
                                        </li>
                                    ))}
                                </ol>
                            );
                        case "formula":
                            return (
                                <div key={i} className="help-formula">
                                    <div className="help-formula-rule">{t(block.text)}</div>
                                    {block.example && <div className="help-formula-example"><span className="u">Example</span> {t(block.example)}</div>}
                                </div>
                            );
                        case "note":
                            return <Banner key={i}>{t(block.text)}</Banner>;
                        case "links": {
                            const resolved = block.links.flatMap((l) => resolveLink(l, ctx, me.id));
                            if (!resolved.length) return null;
                            return (
                                <div key={i} className="help-links">
                                    {resolved.map((l, j) => (
                                        <Link key={`${j}-${l.path}`} className="btn btn-sm" to={l.path}>
                                            {l.label}{l.sub ? <span className="muted"> · {l.sub}</span> : null}<Icon name="arrowRight" />
                                        </Link>
                                    ))}
                                </div>
                            );
                        }
                    }
                })}
            </div>
            {related.length > 0 && (
                <div className="panel-foot help-related">
                    <span className="u">Related</span>
                    {related.map((r) => <Link key={r.id} className="link" to={helpPath(ctx, r.id)}>{r.title}</Link>)}
                </div>
            )}
        </article>
    );
}
