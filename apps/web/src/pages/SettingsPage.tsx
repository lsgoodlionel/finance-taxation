import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { IntegrationSettingsTab } from "./settings/IntegrationSettingsTab";
import { BankConnectTab } from "./settings/BankConnectTab";
import { OpenApiSettingsTab } from "./settings/OpenApiSettingsTab";
import { AutomationGovernanceTab } from "./settings/AutomationGovernanceTab";
import { CompanyTab } from "./settings/CompanyTab";
import { AiConfigTab } from "./settings/AiConfigTab";
import { DisplayTab } from "./settings/DisplayTab";
import { AboutTab } from "./settings/AboutTab";

type Tab = "company" | "ai" | "integration" | "bankConnect" | "openApi" | "automation" | "display" | "about";

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

const TAB_KEYS: readonly Tab[] = [
  "company",
  "ai",
  "integration",
  "bankConnect",
  "openApi",
  "automation",
  "display",
  "about"
];

function isTab(value: string | null): value is Tab {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

export function SettingsPage() {
  // V15：tab 放到 URL 上，支持深链。
  //
  // 每页的「本页指南」要能跳到手册里对应的那一节
  // （/settings?tab=about#guide-xxx）——没有这个的话跳过去只会落在
  // 默认的「公司信息」，用户还得自己找。
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [tab, setTabState] = useState<Tab>(isTab(urlTab) ? urlTab : "company");

  const setTab = (next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    // replace：切 tab 不该在浏览器历史里堆一层，否则「后退」要点很多次
    // 才能离开这一页。
    setSearchParams(params, { replace: true });
  };

  // URL 变了（比如从指南跳进来）要跟着切。
  useEffect(() => {
    if (isTab(urlTab) && urlTab !== tab) setTabState(urlTab);
  }, [urlTab, tab]);

  // 带锚点进来时滚到那一节。等一帧让内容先渲染出来——
  // 立刻滚会因为目标元素还不存在而无声失败。
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "" || tab !== "about") return;
    const timer = window.setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [tab]);

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
          {tabBtn(tab === "bankConnect", () => setTab("bankConnect"), "银企直连")}
          {tabBtn(tab === "openApi", () => setTab("openApi"), "开放 API")}
          {tabBtn(tab === "automation", () => setTab("automation"), "AI 自动化治理")}
          {tabBtn(tab === "display", () => setTab("display"), "显示设置")}
          {tabBtn(tab === "about", () => setTab("about"), "关于系统")}
        </div>
      </section>

      {tab === "company" && <CompanyTab />}
      {tab === "ai" && <AiConfigTab />}
      {tab === "integration" && <IntegrationSettingsTab />}
      {tab === "bankConnect" && <BankConnectTab />}
      {tab === "openApi" && <OpenApiSettingsTab />}
      {tab === "automation" && <AutomationGovernanceTab />}
      {tab === "display" && <DisplayTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}
