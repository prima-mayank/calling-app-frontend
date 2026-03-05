// Basic email check — not overly strict, just must have text@text.tld shape.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns an error string if the login form is invalid, otherwise null.
 */
export const validateLoginForm = ({ email, password }) => {
  const trimmedEmail = String(email || "").trim();
  if (!trimmedEmail) return "Email is required.";
  if (!EMAIL_REGEX.test(trimmedEmail)) return "Enter a valid email address.";

  if (!String(password || "")) return "Password is required.";

  return null;
};

/**
 * Returns an error string if the signup form is invalid, otherwise null.
 */
export const validateSignupForm = ({ displayName, email, password }) => {
  const trimmedName = String(displayName || "").trim();
  if (!trimmedName) return "Display name is required.";
  if (trimmedName.length < 2) return "Display name must be at least 2 characters.";

  const trimmedEmail = String(email || "").trim();
  if (!trimmedEmail) return "Email is required.";
  if (!EMAIL_REGEX.test(trimmedEmail)) return "Enter a valid email address.";

  const pwd = String(password || "");
  if (!pwd) return "Password is required.";
  if (pwd.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

  return null;
};
