import { roles } from "../../config/roles";
import NotAuthorizaedPage from "../../shared/components/NotAuthorizedPage/NotAuthorizedPage";
import useAuth from "../context/Auth/useAuth";
import { Outlet } from "react-router";


const AdminProtectedRoutes = () =>{
    const { user } = useAuth();
    if( !user || !(user.role === roles.SUPER_ADMIN || user.role === roles.ADMIN)){
        return <NotAuthorizaedPage />
    }

    return(
        <Outlet />
    );
}

export default AdminProtectedRoutes;