import { Navigate, Outlet } from "react-router";
import useAuth from "../context/Auth/useAuth";

const AuthenticatedRoutes = () => {
    const { isAuthenticated } = useAuth();

    if(!isAuthenticated){
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

export default AuthenticatedRoutes;