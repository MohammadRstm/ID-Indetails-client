import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useArea, type ShellArea } from "@/app/shell/useArea";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import { SearchInput } from "@/shared/components/Forms/Filters";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ARTICLES, ARTICLE_BY_ID } from "./content";
import HelpArticle from "./HelpArticle";
import { rich } from "./richText";
import { useHelpFacts } from "./helpFacts";
import { helpPath } from "./helpLinks";
import { CATEGORIES, textOf, type Article, type Category, type HelpContext } from "./helpModel";
import { searchHelp } from "./helpSearch";

/**
 * Help, as this person needs it: only the guides for what they may do, with the steps to follow, links straight to
 * the pages, and how the figures they see are worked out. ?q= searches, ?topic= lists a topic, ?article= opens one.
 */
export default function HelpPage() {
    const p = usePermissions();
    const where = useArea();
    const domain = where.kind === "domain" ? where.domain : null;
    // the page's section doesn't change what Help says, so the area is kept steady across renders
    const area: ShellArea = useMemo(() => (domain ? { kind: "domain", domain, section: "help" } : { kind: "company", section: "help" }), [domain]);
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const facts = useHelpFacts(domain);
    const ctx: HelpContext = useMemo(() => ({ p, area }), [p, area]);

    const readable = useMemo(() => ARTICLES.filter((a) => a.who(ctx)), [ctx]);
    const topics = (Object.keys(CATEGORIES) as Category[]).filter((c) => readable.some((a) => a.category === c));

    const [query, setQuery] = useState(params.get("q") ?? "");
    const typed = useDeferredValue(query);
    const hits = useMemo(() => searchHelp(readable, typed, ctx, facts), [readable, typed, ctx, facts]);
    const [sel, setSel] = useState(0);

    const opened = params.get("article");
    const article = opened ? ARTICLE_BY_ID.get(opened) : undefined;
    const topic = params.get("topic") as Category | null;
    const showing = article && article.who(ctx) ? "article" : query.trim() ? "results" : topic && topics.includes(topic) ? "topic" : "home";

    function search(value: string) {
        setQuery(value);
        setSel(0);
        setParams(value.trim() ? { q: value } : {}, { replace: true });
    }
    const open = (id: string) => navigate(helpPath({ area }, id));
    const at = Math.min(sel, hits.length - 1);

    return (
        <div className="page page-narrow">
            <PageHead title="Help" sub="What you can do here, step by step, and how the figures you see are worked out. Only what your access covers is shown." />

            <div className="help-search" onKeyDown={(e) => {
                if (showing !== "results" || !hits.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(at + 1, hits.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(at - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); open(hits[at].article.id); }
            }}>
                <SearchInput value={query} onChange={search} width="100%" autoFocus={!opened}
                    placeholder="Ask a question, e.g. how do I change the company address?" aria-label="Search Help" />
            </div>

            <div className="help-grid">
                <div className="panel" style={{ alignSelf: "start" }}>
                    <nav className="nav" style={{ padding: 8 }} aria-label="Help topics">
                        <button className={cx("nav-item", showing === "home" && "on")} onClick={() => { setQuery(""); navigate(helpPath({ area })); }}>
                            <Icon name="help" /><span className="nav-label">Start here</span>
                        </button>
                        {topics.map((c) => (
                            <button key={c} className={cx("nav-item", ((showing === "topic" && topic === c) || (showing === "article" && article?.category === c)) && "on")}
                                onClick={() => { setQuery(""); navigate(`${helpPath({ area })}?topic=${c}`); }}>
                                <span className="nav-label">{CATEGORIES[c]}</span>
                                <span className="nav-count">{readable.filter((a) => a.category === c).length}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div style={{ minWidth: 0 }}>
                    {showing === "article" && article && (
                        <>
                            <button className="btn btn-sm help-back" onClick={() => navigate(`${helpPath({ area })}?topic=${article.category}`)}>
                                <Icon name="chevronLeft" />{CATEGORIES[article.category]}
                            </button>
                            <HelpArticle article={article} ctx={ctx} facts={facts} />
                        </>
                    )}

                    {showing === "results" && (hits.length ? (
                        <div className="panel">
                            <div className="panel-head"><div className="panel-title">{hits.length === 1 ? "1 answer" : `${hits.length} answers`}</div></div>
                            <div className="panel-body flush" role="listbox" aria-label="Answers">
                                {hits.map((h, i) => (
                                    <ArticleRow key={h.article.id} article={h.article} facts={facts} on={i === at}
                                        onPick={() => open(h.article.id)} onHover={() => setSel(i)} showTopic />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="panel">
                            <Empty art="search" title="No answer to that yet"
                                text="Try other words, or a shorter question. If something doesn't work as it should, use Report a bug in the menu under your name; otherwise, ask your admin." />
                        </div>
                    ))}

                    {showing === "topic" && topic && (
                        <div className="panel">
                            <div className="panel-head"><div className="panel-title">{CATEGORIES[topic]}</div></div>
                            <div className="panel-body flush">
                                {readable.filter((a) => a.category === topic).map((a) => (
                                    <ArticleRow key={a.id} article={a} facts={facts} onPick={() => open(a.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {showing === "home" && (
                        <div className="help-topics">
                            {topics.map((c) => (
                                <div key={c} className="panel">
                                    <div className="panel-head"><div className="panel-title">{CATEGORIES[c]}</div></div>
                                    <div className="panel-body help-topic-list">
                                        {readable.filter((a) => a.category === c).map((a) => (
                                            <Link key={a.id} className="link" to={helpPath({ area }, a.id)}>{a.title}</Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ArticleRow({ article, facts, on, onPick, onHover, showTopic }: {
    article: Article; facts: Parameters<typeof textOf>[1]; on?: boolean; onPick: () => void; onHover?: () => void; showTopic?: boolean;
}) {
    return (
        <button className={cx("help-row", on && "on")} role={onHover ? "option" : undefined} aria-selected={onHover ? !!on : undefined}
            onClick={onPick} onMouseEnter={onHover}>
            <span className="help-row-title">{article.title}</span>
            <span className="help-row-sub">{rich(textOf(article.summary, facts))}</span>
            {showTopic && <span className="help-row-topic">{CATEGORIES[article.category]}</span>}
        </button>
    );
}
