import type { NavigateFunction } from "react-router";
import { authenticatedApi } from "./client";
import { routes } from "../../config/routes";
import { notify } from "../toast";

export function setupInterceptors(
    logout: () => void,
    navigate: NavigateFunction
){

    let isLogginOut = false;

    /**
     * Auth expired 
     */
    const autheticatedRespInterceptor = authenticatedApi.interceptors.response.use(
        response => response,

        error => {

            if (error.response?.status === 401 
                && !isLogginOut // to prevent multiple logging outs happening at once incase multiple requests are sent at the same time
            ){

                notify.error(
                    "Your session has expired, logging out."
                );
                
                isLogginOut = true;
                logout();
                navigate(routes.LOGIN);
            }

            return Promise.reject(error);
        }
    );

    const authenticatedApiReqReceptor = authenticatedApi.interceptors.request.use((config) => {
        const token = localStorage.getItem("token");

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    });

    return {
        autheticatedRespInterceptor,
        authenticatedApiReqReceptor,
    }
}