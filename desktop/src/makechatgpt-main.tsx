import React from "react";
import ReactDOM from "react-dom/client";
import MakeChatGPTFloating from "./makechatgpt/MakeChatGPTFloating";

ReactDOM.createRoot(document.getElementById("makechatgpt-root") as HTMLElement).render(
  <React.StrictMode>
    <MakeChatGPTFloating />
  </React.StrictMode>,
);
