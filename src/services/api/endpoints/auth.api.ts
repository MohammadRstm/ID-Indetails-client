import { apiRoutes } from "../../../config/api.routes";
import type { LoginFormDataType, LoginResponse } from "../../../auth/Login/types";
import { loginResponseSchema } from "../../../auth/Login/validation";
import { unAuthenticatedApi } from "../client";

export const loginService = async (loginFormData : LoginFormDataType) : Promise<LoginResponse> =>{
    const { data } = await unAuthenticatedApi.post<LoginResponse>(
        apiRoutes.AUTH_LOGIN ,
        loginFormData
    );

    return loginResponseSchema.parse(data);
}