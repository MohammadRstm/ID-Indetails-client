import validateForm from "../../../shared/utils/forms/validateForm";
import { loginSchema } from "../validation";
import useLogin from "./data/useLogin";
import useHandleLoginForm from "./ui/useHandleLoginForm";


const useLoginPage = () =>{

    const {
        mutate : loginToServer,
        isPending: loginPending,
        error: loginError
    } = useLogin();

    const{
        loginFormData,
        errors,

        handleChange,
        setErrors,
    } = useHandleLoginForm();

    const submit = (e : React.SubmitEvent<HTMLFormElement>) =>{
        e.preventDefault();

        const hasValidationErrors = validateForm({
        schema: loginSchema,
        formData: loginFormData,
        setErrors
        });

        if(hasValidationErrors) return;    

        // login user to server & after successful login initialize user session
        loginToServer(loginFormData);
    }

    return {
        loginFormData,
        loginError,
        errors,
        loginPending,

        submit,
        handleChange,
    }
}

export default useLoginPage;