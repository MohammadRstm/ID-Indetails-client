import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router";
import useAuth from "../../../../app/context/Auth/useAuth";
import { loginService } from "../../../../services/api/endpoints/auth.api";
import { notify } from "../../../../services/toast";
import { routes } from "../../../../config/routes";

const useLogin = () =>{
    const { login } = useAuth();
    const naviagte = useNavigate();

    return useMutation({
        mutationFn: loginService,
        onSuccess : (data) =>{
            // initialize the user session
            login(data.token, data.user);

            notify.success(
                "Welcome" + data.user.firstname + " " + data.user.lastname
            );
  
            setTimeout(() =>{
                naviagte(routes.HOME);
            }, 2000);

        },
        onError : (error) =>{
            console.log(error);
        }
});
};

export default useLogin;