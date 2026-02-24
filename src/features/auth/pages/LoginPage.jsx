import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { loginWithPassword } from "../services/authApi";
import { saveAuthSession } from "../utils/authStorage";
import { refreshSocketAuthSession } from "../../../services/socketClient";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(() => {
    return String(email).trim().length > 0 && String(password).length > 0;
  }, [email, password]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await loginWithPassword({
        email: String(email || "").trim(),
        password,
      });
      saveAuthSession({
        token: result?.token,
        user: result?.user || null,
      });
      refreshSocketAuthSession();
      setSuccess("Login successful. Redirecting...");
      window.setTimeout(() => navigate("/"), 250);
    } catch (submitError) {
      setError(String(submitError?.message || "Login failed.").trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Login"
      subtitle="Use your account to access personal calling and remote-control history."
      footer={
        <span>
          New here?{" "}
          <Link to="/signup" className="auth-link">
            Create account
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-field">
          <span className="auth-label">Email</span>
          <input
            type="text"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email or test id"
            className="form-input auth-input"
            required
          />
        </label>

        <label className="auth-field">
          <span className="auth-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="form-input auth-input"
            required
          />
        </label>

        {error ? <div className="error-text">{error}</div> : null}
        {success ? <div className="auth-success-text">{success}</div> : null}

        <div className="auth-actions">
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
          <button type="button" className="btn btn-default" onClick={() => navigate("/")}>
            Back Home
          </button>
        </div>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
