import { Outlet } from "react-router";
import "./PagesWithHeaders.css";
import Header from "../../components/Header/Header";

const PagesWithHeaderLayout = () =>{
    return(
        <>
            <Header />
            <Outlet />
        </>
    );
}

export default PagesWithHeaderLayout;