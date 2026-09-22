import type { FallbackProps } from "react-error-boundary";
import "./ErrorFallback.css";

const ErrorFallback = ({ resetErrorBoundary }: FallbackProps) => {
    return (
        <div className="error-page">

            <div className="error-card">

                <div className="error-icon">
                    !
                </div>

                <h1 className="error-title">
                    Oops!
                </h1>

                <p className="error-text">
                    Something went wrong while loading this page.
                    Please try again.
                </p>

                <button
                    className="error-btn"
                    onClick={resetErrorBoundary}
                >
                    Try Again
                </button>

            </div>

        </div>
    );
};

export default ErrorFallback;