import { useContext } from "react"
import AuthContext from "./AuthContext"

const useAuth = () =>{
    const value = useContext(AuthContext);

    if(!value){
        throw new Error("Context error | Auth context must be used withing Auth Context Provider");
    }

    return value;
}

export default useAuth;