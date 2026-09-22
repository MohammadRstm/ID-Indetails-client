import { routes } from "../../config/routes";
import "./Footer.css";
import { Link } from "react-router";

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer__content">

                <div className="footer__brand">
                    <h2>React Starter</h2>
                    <p>
                        A scalable React + TypeScript starter template with
                        authentication, routing, React Query, reusable components,
                        and custom hooks.
                    </p>
                </div>

                <nav className="footer__links">
                    <Link to={routes.HOME}>Home</Link>
                    <Link to={routes.ABOUTUS}>About</Link>
                    <Link to={routes.LOGIN}>Login</Link>
                    <Link to={routes.SIGNUP}>Signup</Link>
                </nav>

            </div>

            <div className="footer__bottom">
                © {new Date().getFullYear()} React Starter. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;