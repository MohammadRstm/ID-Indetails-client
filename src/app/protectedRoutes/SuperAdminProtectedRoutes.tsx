import { roles } from "../../config/roles";
import NotAuthorizaedPage from "../../shared/components/NotAuthorizedPage/NotAuthorizedPage";
import useAuth from "../context/Auth/useAuth";
import { Outlet } from "react-router";


const SuperAdminProtectedRoutes = () =>{
    const { user } = useAuth();
    if( !user || !(user.role === roles.SUPER_ADMIN)){
        return <NotAuthorizaedPage />
    }

    return(
        <Outlet />
    );
}

export default SuperAdminProtectedRoutes;