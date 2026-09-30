import { useNavigate } from "react-router"
import { routes } from "../../../config/routes"

const CompanyOverviewPage = () =>{

    const navigate = useNavigate();

    return (
        <div className="overview-page-main">
            <div className="overview-page-inner">
                <div className="overview-domains">
                    <div className="overview-page-design">
                        <div className="design-logo">
                            D-LOGO
                        </div>
                        <div onClick={() => navigate(routes.COMPANY_DESIGN)} className="design-desc">
                            This is the design domain of the company
                        </div>
                    </div>

                    <div onClick={() => navigate(routes.COMPANY_EXECUTION)} className="overview-page-execution">
                        <div className="execution-logo">
                            E-LOGO
                        </div>
                        <div className="execution-desc">
                            This is the execution domain of the company
                        </div>
                    </div>
                </div>

                <div onClick={() => navigate(routes.COMPANY_OVERVIEW)} className="overview-company-overview">
                    <div className="overview-ov-logo">
                        O-LOGO
                    </div>
                    <div className="overview-ov-desc">
                        This is the overview domain of the company
                    </div>
                </div>
            </div>
        </div>

    );
}


export default CompanyOverviewPage;