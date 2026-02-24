import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { signupWithPassword } from "../services/authApi";
import { saveAuthSession } from "../utils/authStorage";
import { refreshSocketAuthSession } from "../../../services/socketClient";

const SignupPage = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(() => {
    return (
      String(displayName || "").trim().length > 0 &&
      String(email || "").trim().length > 0 &&
      String(password || "").length > 0
    );
  }, [displayName, email, password]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await signupWithPassword({
        displayName: String(displayName || "").trim(),
        email: String(email || "").trim(),
        password,
      });
      saveAuthSession({
        token: result?.token,
        user: result?.user || null,
      });
      refreshSocketAuthSession();
      setSuccess("Account created. Redirecting...");
      window.setTimeout(() => navigate("/"), 250);
    } catch (submitError) {
      setError(String(submitError?.message || "Signup failed.").trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create Account"
      subtitle="Set up your identity so 1:1 calls, meeting links, and remote host ownership map to users."
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/login" className="auth-link">
            Login
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-field">
          <span className="auth-label">Display Name</span>
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            className="form-input auth-input"
            required
            maxLength={64}
          />
        </label>

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
            autoComplete="new-password"
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
            {isSubmitting ? "Creating..." : "Create Account"}
          </button>
          <button type="button" className="btn btn-default" onClick={() => navigate("/")}>
            Back Home
          </button>
        </div>
      </form>
    </AuthShell>
  );
};

export default SignupPage;
