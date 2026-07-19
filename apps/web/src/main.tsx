import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xinxisuyang/ui/tokens.css";
import "@xinxisuyang/ui/typography.css";
import "@xinxisuyang/ui/motion.css";
import "./styles/global.css";
import "./styles/dashboard.css";
import "./styles/forms.css";
import "./styles/display.css";
import { App } from "./app/App.js";

const root = document.querySelector("#root");
if (root === null) throw new Error("APP_ROOT_NOT_FOUND");
createRoot(root).render(<StrictMode><App /></StrictMode>);
