import { useState } from "react";
import type { User } from "../shared/types/generalTypes";
import AuthContext from "../context/Auth/AuthContext";

export const AuthProvider = ({ children }: { children: React.ReactNode }) =>{
    const [user, setUser] = useState<User | null>(null);

    const login = (token: string, user : User) =>{
        localStorage.setItem("token" , token);
        setUser(user);
    };
    
    const logout = () => {
       setUser(null);
    }; 


    return(
        <AuthContext
            value={{
                user,
                isAuthenticated: !!user,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext>
    );
};