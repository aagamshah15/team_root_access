// Minimal L10 dev harness: mounts only the Add-a-room screen. L07 replaces this with the real app shell.
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import AddRoom from "./screens/AddRoom";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AddRoom />
  </React.StrictMode>,
);
