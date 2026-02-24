import { Link } from "react-router-dom";

const HomeGuestSection = () => {
  return (
    <section className="home-section panel">
      <div className="home-section-head">
        <h2 className="home-section-title">Call Your Friend</h2>
        <p className="home-section-subtitle">
          Login first to see contacts and start direct audio/video calls.
        </p>
      </div>

      <div className="home-guest-actions">
        <Link to="/login" className="btn btn-primary home-account-btn">
          Login
        </Link>
        <Link to="/signup" className="btn btn-default home-account-btn">
          Signup
        </Link>
      </div>
    </section>
  );
};

export default HomeGuestSection;
