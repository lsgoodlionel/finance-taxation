import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Toaster } from "sonner";
import "./index.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { App } from "./App";

const antdTheme = {
  token: {
    colorPrimary: "#2563eb",
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    colorInfo: "#0891b2",
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: "'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif",
    fontSize: 14,
    colorBgContainer: "#ffffff",
    colorBgLayout: "#f1f5f9",
    colorBorder: "#e2e8f0",
    colorTextSecondary: "#64748b",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    boxShadowSecondary: "0 4px 12px rgba(0,0,0,0.10)",
  },
  components: {
    Layout: {
      siderBg: "#0f172a",
      triggerBg: "#1e293b",
    },
    Menu: {
      darkItemBg: "#0f172a",
      darkSubMenuItemBg: "#0f172a",
      darkItemSelectedBg: "rgba(37,99,235,0.25)",
      darkItemColor: "#94a3b8",
      darkItemHoverColor: "#e2e8f0",
      darkItemSelectedColor: "#93c5fd",
      itemHeight: 38,
    },
    Table: {
      headerBg: "#f8fafc",
      rowHoverBg: "#f8fafc",
      borderColor: "#e2e8f0",
    },
    Card: {
      headerBg: "#ffffff",
    },
    Button: {
      primaryShadow: "none",
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntApp>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
