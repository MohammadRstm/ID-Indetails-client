import axios from "axios";
import { env } from "../../config/env";

export const authenticatedApi = axios.create({
    baseURL: env.apiUrl,
});

export const unAuthenticatedApi = axios.create({
    baseURL: env.apiUrl,
    headers: {
        Accept: "application/json",
    },
});


