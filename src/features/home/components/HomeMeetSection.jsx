const HomeMeetSection = ({ onStartVideoMeet, onStartAudioMeet }) => {
  return (
    <section className="home-section panel">
      <div className="home-section-head">
        <h2 className="home-section-title">Start New Meet (Link)</h2>
        <p className="home-section-subtitle">
          Create a room instantly and share link with anyone. Login is not required.
        </p>
      </div>

      <div className="home-actions">
        <button onClick={onStartVideoMeet} className="btn btn-call-video home-action-btn">
          Start Video Meet
        </button>
        <button onClick={onStartAudioMeet} className="btn btn-call-audio home-action-btn">
          Start Audio Meet
        </button>
      </div>
    </section>
  );
};

export default HomeMeetSection;
