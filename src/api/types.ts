import type { components } from "./schema";

/** Every request and response shape of the API, generated from its OpenAPI document. */
export type Schemas = components["schemas"];

export type AuthResponse = Schemas["AuthResponse"];
export type CurrentUser = Schemas["CurrentUserResponse"];

/** The API's paged list: `{ items, page, pageSize, totalCount }`. */
export type Paged<T> = { items: T[]; page: number; pageSize: number; totalCount: number };
