import type { Article } from "../helpModel";
import { billing, clients } from "./clientsAndBilling";
import { company, settings } from "./companyAndSettings";
import { explainedMoney } from "./explainedMoney";
import { explainedPay } from "./explainedPay";
import { gettingStarted } from "./gettingStarted";
import { people } from "./people";
import { projects } from "./projects";
import { work } from "./work";

/** Every Help article, in the order Help lists them within a topic. */
export const ARTICLES: Article[] = [
    ...gettingStarted,
    ...work,
    ...projects,
    ...clients,
    ...billing,
    ...people,
    ...company,
    ...settings,
    ...explainedPay,
    ...explainedMoney,
];

export const ARTICLE_BY_ID: ReadonlyMap<string, Article> = new Map(ARTICLES.map((a) => [a.id, a]));
