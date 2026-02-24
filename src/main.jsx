import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/theme.css";
import "./styles/buttons.css";
import "./styles/home.css";
import "./styles/auth.css";
import "./styles/room.css";
import "./styles/media.css";
import { BrowserRouter } from "react-router-dom";
import { SocketProvider } from "./Context/SocketContext";


ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <SocketProvider>
      <App />
    </SocketProvider>
  </BrowserRouter>
);
