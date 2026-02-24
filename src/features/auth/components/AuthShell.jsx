export const AuthShell = ({ title, subtitle, children, footer }) => {
  return (
    <div className="auth-page">
      <div className="auth-shell panel">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        <div className="auth-body">{children}</div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </div>
  );
};
