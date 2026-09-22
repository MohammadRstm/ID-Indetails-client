import "./Header.css";
import { Link } from "react-router";
import { IoSearch } from "react-icons/io5";
import { routes } from "../../config/routes";

const Header = () =>{

    return(
        <div className="header">
            <div className="header-logo">
               <Link className="home-link" to={routes.HOME}>Logo</Link>
            </div> 
             
            
            <div className="header-search-bar">
                <input
                className="header-search-inp"
                name="field_name"
                type="text"
                placeholder="Search..."
                />

                <button
                className="header-search-submit-btn"
                >
                    <IoSearch />
                </button>
            </div>
            

            <div className="header-nav-bar">
                <Link className="header-nav-link header-aboutus-link" to={routes.ABOUTUS}>Aboutus</Link>
                <Link className="header-nav-link header-login-link" to={routes.LOGIN}>Login</Link>
                <Link className="header-nav-link header-signup-link" to={routes.SIGNUP}>Signup</Link>
            </div>

        </div>
    );
}

export default Header;