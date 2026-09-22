import { Route, Routes } from "react-router"
import PagesWithHeaderLayout from "../shared/layout/PagesWithHeaders/PagesWithHeaders";
import AuthenticatedRoutes from "./AuthenticatedRoutes";
import ErrorBoundaryRoutes from "./ErrorBoundaryRoutes";
import Home from "../features/Home/Home";
import { routes } from "../config/routes";
import Login from "../auth/Login/Login";

const AppRoutes = () =>{

    return(
        <Routes>
            <Route element={<ErrorBoundaryRoutes />}>

                <Route element={<PagesWithHeaderLayout />}>
                    <Route path={routes.LOGIN} element={<Login />} />
                    <Route path={routes.HOME} element={<Home />} />
                    <Route element={<AuthenticatedRoutes />}>
                        {/** EX USER PROFILE */}
                    </Route>    
                </Route>
            </Route>
        </Routes>
    );
}

export default AppRoutes;