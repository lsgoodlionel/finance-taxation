import { useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { IntegrationSettingsTab } from "./settings/IntegrationSettingsTab";
import { OpenApiSettingsTab } from "./settings/OpenApiSettingsTab";
import { AutomationGovernanceTab } from "./settings/AutomationGovernanceTab";
import { CompanyTab } from "./settings/CompanyTab";
import { AiConfigTab } from "./settings/AiConfigTab";
import { DisplayTab } from "./settings/DisplayTab";
import { AboutTab } from "./settings/AboutTab";

type Tab = "company" | "ai" | "integration" | "openApi" | "automation" | "display" | "about";

function tabBtn(active: boolean, onClick: () => void, label: string) {
  return (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: "8px 20px",
        borderRadius: "20px",
        border: "none",
        cursor: "pointer",
        fontWeight: active ? 700 : 400,
        background: active ? "#1e2a37" : "transparent",
        color: active ? "#fff" : "#4d5d6c"
      }}
    >
      {label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">
        <PageHeader title="系统设置" subtitle={buildResultPageSubtitle("系统设置")} />
      </section>

      <section className="v3-section-shell" data-tone="muted">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tabBtn(tab === "company", () => setTab("company"), "公司信息")}
          {tabBtn(tab === "ai", () => setTab("ai"), "AI 配置")}
          {tabBtn(tab === "integration", () => setTab("integration"), "外部对接")}
          {tabBtn(tab === "openApi", () => setTab("openApi"), "开放 API")}
          {tabBtn(tab === "automation", () => setTab("automation"), "AI 自动化治理")}
          {tabBtn(tab === "display", () => setTab("display"), "显示设置")}
          {tabBtn(tab === "about", () => setTab("about"), "关于系统")}
        </div>
      </section>

      {tab === "company" && <CompanyTab />}
      {tab === "ai" && <AiConfigTab />}
      {tab === "integration" && <IntegrationSettingsTab />}
      {tab === "openApi" && <OpenApiSettingsTab />}
      {tab === "automation" && <AutomationGovernanceTab />}
      {tab === "display" && <DisplayTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}
