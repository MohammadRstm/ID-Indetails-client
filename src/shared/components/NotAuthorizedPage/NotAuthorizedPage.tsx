import { routes } from "../../../config/routes";
import "./ErrorFallback.css";
import { useNavigate } from "react-router";

const NotAuthorizaedPage = () => {
    const navigate = useNavigate();
    return (
        <div className="authorization-page">

            <div className="authorization-card">

                <div className="authorization-icon">
                    !
                </div>

                <h1 className="authorization-title">
                    Oops!
                </h1>

                <p className="authorization-text">
                    You are not authorized to access this page.
                </p>

                <button onClick={() => navigate(routes.HOME)}>
                    Go back home
                </button>

            </div>

        </div>
    );
};

export default NotAuthorizaedPage;