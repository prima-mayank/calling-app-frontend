import { useState } from "react";
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

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

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
      const errorCode = String(submitError?.code || "").trim();
      if (errorCode === "auth-unavailable") {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const fallbackEmail = normalizedEmail || `tester-${Date.now()}@local.test`;
        const fallbackDisplayName =
          String(fallbackEmail.split("@")[0] || "").trim() || "Local Tester";
        const fallbackUserId =
          fallbackEmail.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") ||
          `user-${Date.now()}`;

        saveAuthSession({
          token: `local-test-${Date.now()}`,
          user: {
            id: fallbackUserId,
            email: fallbackEmail,
            displayName: fallbackDisplayName,
          },
        });
        refreshSocketAuthSession();
        setSuccess("Auth disabled on server. Local test session started.");
        window.setTimeout(() => navigate("/"), 250);
        return;
      }
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
          />
        </label>

        {error ? <div className="error-text">{error}</div> : null}
        {success ? <div className="auth-success-text">{success}</div> : null}

        <div className="auth-actions">
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
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
