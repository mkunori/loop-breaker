import { createRoot } from "react-dom/client";
import { GameRuntime } from "./platform/runtime";
import { App } from "./ui/App";
import "./ui/style.css";

// Lazy calls keep startup recoverable when browser storage is unavailable.
const runtime = new GameRuntime({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
const root = document.getElementById("root");
if (root) createRoot(root).render(<App runtime={runtime} />);
