import { Route, Routes } from "react-router"
import AuthenticatedRoutes from "./AuthenticatedRoutes";
import ErrorBoundaryRoutes from "./ErrorBoundaryRoutes";
import { routes } from "../../config/routes";
import PagesWithHeaderLayout from "../../shared/layout/PagesWithHeaders/PagesWithHeaders";
import Login from "../../auth/Login/Login";


const AppRoutes = () =>{

    return(
        <Routes>
            <Route element={<ErrorBoundaryRoutes />}>

                <Route element={<PagesWithHeaderLayout />}>
                    <Route path={routes.LOGIN} element={<Login />} />
                    <Route element={<AuthenticatedRoutes />}>
                        {/** EX USER PROFILE */}
                    </Route>    
                </Route>
            </Route>
        </Routes>
    );
}

export default AppRoutes;