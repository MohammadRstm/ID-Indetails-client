import "./Login.css";
import { Link } from "react-router";
import Spinner from "../../shared/components/LoadingSpinner/LoadingSpinner";
import useLoginPage from "./hooks/useLoginPage";

const Login = () => {
    const {
        loginFormData,
        loginError,
        errors,
        loginPending,
        submit,
        handleChange,
    } = useLoginPage();

    return (
        <main className="login-page">
            <form className="login-form" onSubmit={submit}>

                <h1 className="login-title">Welcome Back</h1>

                <p className="login-subtitle">
                    Sign in to continue to your account.
                </p>

                {loginError && (
                    <div className="login-server-errors">
                        Invalid username or password.
                    </div>
                )}

                <label className="login-field">
                    <span className="login-label-text">Username</span>

                    <input
                        id="username"
                        name="username"
                        className="login-form-inp"
                        type="text"
                        placeholder="Enter your username"
                        value={loginFormData.username}
                        onChange={handleChange}
                    />

                    {errors?.username && (
                        <p className="validation-errors">{errors.username}</p>
                    )}
                </label>

                <label className="login-field">
                    <span className="login-label-text">Password</span>

                    <input
                        id="password"
                        name="password"
                        className="login-form-inp"
                        type="password"
                        placeholder="Enter your password"
                        value={loginFormData.password}
                        onChange={handleChange}
                    />

                    {errors?.password && (
                        <p className="validation-errors">{errors.password}</p>
                    )}
                </label>

                <button
                    className="login-submit-btn"
                    disabled={loginPending}
                >
                    {loginPending ? (
                        <Spinner size={20} />
                    ) : (
                        "Login"
                    )}
                </button>

                <p className="signup-suggestion">
                    Don't have an account?{" "}
                    <Link
                        className="signup-suggestion-link"
                        to="/signup"
                    >
                        Create one
                    </Link>
                </p>

            </form>
        </main>
    );
};

export default Login;