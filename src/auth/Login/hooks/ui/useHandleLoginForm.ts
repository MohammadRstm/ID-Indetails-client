import { useState } from "react";
import type { LoginFormDataType } from "../../types";
import { INITIAL_LOGIN_FORM_DATA } from "../../constants";
import { createFieldUpdater } from "../../../../shared/utils/forms/createFieldUpdater";

const useHandleLoginForm = () =>{

    const [loginFormData , setLoginFormData] = useState<LoginFormDataType>(INITIAL_LOGIN_FORM_DATA)
    const [ errors , setErrors ] = useState<Partial<Record<keyof LoginFormDataType , string>>>({});

    const updateField = createFieldUpdater(setLoginFormData , setErrors);

    const handleChange = (e : React.ChangeEvent<HTMLInputElement>) =>{
        updateField(e.target.name as keyof LoginFormDataType, e.target.value);
    }

    return{
        loginFormData,
        errors,
    
        handleChange,
        setErrors
    };
}

export default useHandleLoginForm;