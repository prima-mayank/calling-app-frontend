import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./Pages/Home";
import Room from "./Pages/Room";
import LoginPage from "./features/auth/pages/LoginPage";
import SignupPage from "./features/auth/pages/SignupPage";
import DirectCallFloatingPanel from "./features/directCall/components/DirectCallFloatingPanel";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:id" element={<Room />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DirectCallFloatingPanel />
    </>
  );
}

export default App;
