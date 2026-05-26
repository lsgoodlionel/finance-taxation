import { useEffect, useState, useCallback } from "react";
import { useI18n, type Lang } from "../lib/i18n";
import {
  getCompanyProfile,
  updateCompanyProfile,
  getAiSettings,
  updateAiSettings,
  getOllamaModels,
  testAiConnection
} from "../lib/api";
import type { CompanyProfile, AiConfigResponse, AiProviderInfo } from "../lib/api";
import { buildResultPageSubtitle } from "../lib/entry-guidance";

type Tab = "company" | "ai" | "display" | "about";

// ─── Shared layout helpers ────────────────────────────────────────────────────

function panelStyle(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "28px"
  };
}

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

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 700, color: "#9aa5b4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px", marginTop: "4px" }}>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "12px", alignItems: "center", marginBottom: "14px" }}>
      <label style={{ color: "#4d5d6c", fontSize: "13px", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return { width: "100%", maxWidth: "360px" };
}

// ─── AI Tab ───────────────────────────────────────────────────────────────────

const PROVIDER_BADGES: Record<string, string> = {
  anthropic: "🧠",
  openai: "🤖",
  deepseek: "🔍",
  zhipu: "🧬",
  qwen: "🌐",
  moonshot: "🌙",
  ollama: "🦙"
};

interface OllamaModelItem {
  name: string;
  size: number;
  modifiedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

function AiConfigTab() {
  const [cfg, setCfg] = useState<AiConfigResponse | null>(null);
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);

  const [selectedProvider, setSelectedProvider] = useState("ollama");
  const [selectedModel, setSelectedModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [ollamaModels, setOllamaModels] = useState<OllamaModelItem[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState("");

  const [testResult, setTestResult] = useState<{ ok: boolean; note: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    void getAiSettings().then((data) => {
      setCfg(data);
      setProviders(data.providers);
      setSelectedProvider(data.provider);
      setSelectedModel(data.model);
      setBaseUrl(data.baseUrl ?? "");
    });
  }, []);

  const providerInfo = providers.find((p) => p.id === selectedProvider);
  const effectiveBaseUrl = baseUrl || providerInfo?.defaultBaseUrl || "";

  const fetchOllamaModels = useCallback(async () => {
    const url = effectiveBaseUrl || "http://localhost:11434";
    setOllamaLoading(true);
    setOllamaError("");
    try {
      const res = await getOllamaModels(url);
      setOllamaModels(res.models);
      const first = res.models[0];
      if (first && (!selectedModel || !res.models.find((m) => m.name === selectedModel))) {
        setSelectedModel(first.name);
      }
    } catch (e) {
      setOllamaError((e as Error).message);
    } finally {
      setOllamaLoading(false);
    }
  }, [effectiveBaseUrl, selectedModel]);

  function handleProviderChange(pid: string) {
    const info = providers.find((p) => p.id === pid);
    setSelectedProvider(pid);
    setSelectedModel(info?.models[0]?.id ?? "");
    setBaseUrl(pid === "ollama" ? (cfg?.baseUrl ?? "") : "");
    setApiKey("");
    setTestResult(null);
    setOllamaModels([]);
    setOllamaError("");
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection({
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey || undefined,
        baseUrl: effectiveBaseUrl || undefined
      });
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, note: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateAiSettings({
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey || undefined,
        baseUrl: effectiveBaseUrl || undefined
      });
      setCfg(updated);
      setApiKey("");
      setSaveMsg("AI 配置已保存。");
    } catch (e) {
      setSaveMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="state-loading">加载中…</div>;

  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0, marginBottom: "24px" }}>AI 后端配置</h3>

      {/* Provider selection */}
      <SectionHeader>选择 AI 服务商</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px", marginBottom: "24px" }}>
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => handleProviderChange(p.id)}
            style={{
              padding: "12px 14px",
              borderRadius: "14px",
              border: `2px solid ${selectedProvider === p.id ? "#1e2a37" : "rgba(20,40,60,0.12)"}`,
              background: selectedProvider === p.id ? "#1e2a37" : "rgba(255,255,255,0.6)",
              color: selectedProvider === p.id ? "#fff" : "#2d3a48",
              cursor: "pointer",
              textAlign: "left",
              fontSize: "13px",
              fontWeight: selectedProvider === p.id ? 700 : 400,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span style={{ fontSize: "18px" }}>{PROVIDER_BADGES[p.id] ?? "🔧"}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {/* Current config badge */}
      {cfg.provider && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "12px",
          background: "rgba(20,40,60,0.04)",
          border: "1px solid rgba(20,40,60,0.08)",
          marginBottom: "20px",
          fontSize: "13px",
          color: "#4d5d6c"
        }}>
          当前已保存：<strong>{cfg.provider}</strong> / <code style={{ fontSize: "12px" }}>{cfg.model}</code>
          {cfg.apiKeyConfigured && <span style={{ marginLeft: "10px", color: "#27ae60" }}>✅ API Key 已配置（{cfg.apiKeyMasked}）</span>}
        </div>
      )}

      {/* Model selection */}
      <SectionHeader>选择模型</SectionHeader>
      {selectedProvider === "ollama" ? (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={providerInfo?.defaultBaseUrl ?? "http://localhost:11434"}
              style={{ flex: 1, maxWidth: "280px" }}
            />
            <button
              onClick={() => void fetchOllamaModels()}
              disabled={ollamaLoading}
              className="btn btn-secondary"
              style={{ whiteSpace: "nowrap" }}
            >
              {ollamaLoading ? "获取中…" : "获取已安装模型"}
            </button>
          </div>
          {ollamaError && <div className="alert alert-error" style={{ marginBottom: "8px" }}>{ollamaError}</div>}
          {ollamaModels.length > 0 ? (
            <div style={{ display: "grid", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
              {ollamaModels.map((m) => (
                <button
                  key={m.name}
                  onClick={() => setSelectedModel(m.name)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: `1.5px solid ${selectedModel === m.name ? "#1e2a37" : "rgba(20,40,60,0.1)"}`,
                    background: selectedModel === m.name ? "rgba(30,42,55,0.08)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "13px"
                  }}
                >
                  <span style={{ fontWeight: selectedModel === m.name ? 700 : 400 }}>{m.name}</span>
                  <span style={{ color: "#9aa5b4", fontSize: "11px" }}>{formatBytes(m.size)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#9aa5b4" }}>
              点击「获取已安装模型」从 Ollama 加载模型列表，或手动输入模型名称：
              <input
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="例如 gemma4:latest"
                style={{ marginTop: "8px", width: "100%", maxWidth: "360px", display: "block" }}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: "20px" }}>
          {providerInfo && providerInfo.models.length > 0 ? (
            <div style={{ display: "grid", gap: "6px" }}>
              {providerInfo.models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: `1.5px solid ${selectedModel === m.id ? "#1e2a37" : "rgba(20,40,60,0.1)"}`,
                    background: selectedModel === m.id ? "rgba(30,42,55,0.08)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "13px",
                    fontWeight: selectedModel === m.id ? 700 : 400
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : (
            <input
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="输入模型 ID"
              style={inputStyle()}
            />
          )}
        </div>
      )}

      {/* API Key */}
      {providerInfo?.authType === "apiKey" && (
        <>
          <SectionHeader>API Key</SectionHeader>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={cfg.apiKeyConfigured ? "已配置（输入新值可替换）" : providerInfo.keyPlaceholder}
                style={{ flex: 1, maxWidth: "360px" }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{ background: "transparent", border: "1px solid rgba(20,40,60,0.15)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" }}
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
            <div style={{ fontSize: "12px", color: "#9aa5b4", marginTop: "6px" }}>
              Key 仅存储于服务器数据库，不在客户端缓存。
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" }}>
        <button
          onClick={() => void handleTest()}
          disabled={testing}
          className="btn btn-secondary"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? "保存中…" : "保存配置"}
        </button>
        {saveMsg && (
          <span style={{ fontSize: "13px", color: saveMsg.includes("已保存") ? "#27ae60" : "#e74c3c" }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          marginTop: "14px",
          padding: "12px 16px",
          borderRadius: "12px",
          background: testResult.ok ? "rgba(39,174,96,0.08)" : "rgba(231,76,60,0.08)",
          border: `1px solid ${testResult.ok ? "rgba(39,174,96,0.2)" : "rgba(231,76,60,0.2)"}`,
          fontSize: "13px"
        }}>
          {testResult.ok ? "✅" : "❌"} {testResult.note}
        </div>
      )}
    </article>
  );
}

// ─── Company Tab ──────────────────────────────────────────────────────────────

function CompanyTab() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [editProfile, setEditProfile] = useState<Partial<CompanyProfile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCompanyProfile().then((p) => {
      setProfile(p);
      setEditProfile(p);
    }).catch((e: Error) => setMessage(e.message));
  }, []);

  function updateField(key: keyof CompanyProfile, value: string) {
    setEditProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateCompanyProfile({
        name: editProfile.name,
        registeredAddress: editProfile.registeredAddress,
        contactEmail: editProfile.contactEmail,
        contactPhone: editProfile.contactPhone,
        creditCode: editProfile.creditCode,
        legalRepresentative: editProfile.legalRepresentative,
        bankName: editProfile.bankName,
        bankAccount: editProfile.bankAccount,
        financeApproverRole: editProfile.financeApproverRole
      });
      setProfile(updated);
      setEditProfile(updated);
      setMessage("公司信息已保存。");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <div className="state-loading">加载中…</div>;

  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0, marginBottom: "24px" }}>公司基本信息</h3>

      {message && (
        <div className={`alert ${message.includes("失败") || message.includes("错误") ? "alert-error" : "alert-info"}`} style={{ marginBottom: "16px" }}>
          {message}
        </div>
      )}

      <SectionHeader>基础信息</SectionHeader>
      <FieldRow label="公司 ID">
        <span style={{ color: "#4d5d6c", fontFamily: "monospace", fontSize: "13px" }}>{profile.id}</span>
      </FieldRow>
      <FieldRow label="公司名称">
        <input value={editProfile.name ?? ""} onChange={(e) => updateField("name", e.target.value)} style={inputStyle()} />
      </FieldRow>
      <FieldRow label="统一社会信用代码">
        <input value={editProfile.creditCode ?? ""} onChange={(e) => updateField("creditCode", e.target.value)} placeholder="18 位统一社会信用代码" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="法定代表人">
        <input value={editProfile.legalRepresentative ?? ""} onChange={(e) => updateField("legalRepresentative", e.target.value)} placeholder="法定代表人姓名" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="注册地址">
        <input value={editProfile.registeredAddress ?? ""} onChange={(e) => updateField("registeredAddress", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>联系方式</SectionHeader>
      <FieldRow label="联系邮箱">
        <input type="email" value={editProfile.contactEmail ?? ""} onChange={(e) => updateField("contactEmail", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="联系电话">
        <input value={editProfile.contactPhone ?? ""} onChange={(e) => updateField("contactPhone", e.target.value)} placeholder="选填" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>银行账户</SectionHeader>
      <FieldRow label="开户银行">
        <input value={editProfile.bankName ?? ""} onChange={(e) => updateField("bankName", e.target.value)} placeholder="例如：招商银行上海分行" style={inputStyle()} />
      </FieldRow>
      <FieldRow label="银行账号">
        <input value={editProfile.bankAccount ?? ""} onChange={(e) => updateField("bankAccount", e.target.value)} placeholder="基本户账号" style={inputStyle()} />
      </FieldRow>

      <div style={{ height: "20px" }} />
      <SectionHeader>财务管理</SectionHeader>
      <FieldRow label="财务负责人角色">
        <div>
          <select
            value={editProfile.financeApproverRole ?? "role-chairman"}
            onChange={(e) => updateField("financeApproverRole", e.target.value)}
            style={{ ...inputStyle(), cursor: "pointer" }}
          >
            <option value="role-chairman">创始人/董事长</option>
            <option value="role-finance-director">财务总监</option>
            <option value="role-accountant">会计</option>
          </select>
          <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#9aa5b4" }}>
            该角色负责审核并最终确认凭证过账。默认为创始人/董事长。
          </p>
        </div>
      </FieldRow>

      <div style={{ marginTop: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
        <button onClick={() => void saveProfile()} disabled={saving} className="btn btn-primary">
          {saving ? "保存中…" : "保存公司信息"}
        </button>
        {profile.updatedAt && (
          <span style={{ fontSize: "12px", color: "#9aa5b4" }}>
            最后更新：{new Date(profile.updatedAt).toLocaleString("zh-CN")}
          </span>
        )}
      </div>
    </article>
  );
}

// ─── Display Tab ──────────────────────────────────────────────────────────────

function DisplayTab() {
  const { lang, setLang } = useI18n();
  const [pendingLang, setPendingLang] = useState<Lang>(lang);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setLang(pendingLang);
    localStorage.setItem("ft-lang", pendingLang);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const options: { value: Lang; label: string; description: string }[] = [
    { value: "zh", label: "简体中文", description: "所有状态、类型等枚举值以中文显示（默认）" },
    { value: "en", label: "English", description: "All enum values displayed in English" }
  ];

  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0, marginBottom: "24px" }}>显示设置</h3>

      <SectionHeader>界面语言</SectionHeader>
      <FieldRow label="页面语言">
        <div style={{ display: "grid", gap: "10px" }}>
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                cursor: "pointer", padding: "12px 16px",
                border: `2px solid ${pendingLang === opt.value ? "rgba(79,142,247,0.6)" : "rgba(20,40,60,0.1)"}`,
                borderRadius: "10px",
                background: pendingLang === opt.value ? "rgba(79,142,247,0.06)" : "transparent"
              }}
            >
              <input
                type="radio"
                name="lang"
                value={opt.value}
                checked={pendingLang === opt.value}
                onChange={() => setPendingLang(opt.value)}
                style={{ accentColor: "#4f8ef7" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{opt.label}</div>
                <div style={{ fontSize: "12px", color: "#9aa5b4", marginTop: "2px" }}>{opt.description}</div>
              </div>
            </label>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
            <button
              onClick={handleSave}
              disabled={saved}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                cursor: saved ? "default" : "pointer",
                background: saved ? "#1a7f5a" : "#1e2a37",
                color: "#fff",
                fontWeight: 600,
                fontSize: "13px"
              }}
            >
              {saved ? "已保存 ✓" : "保存显示设置"}
            </button>
            {pendingLang !== lang && !saved && (
              <span style={{ fontSize: "12px", color: "#d97706" }}>尚未保存</span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9aa5b4" }}>
            保存后即时生效，刷新页面后保持设置。
          </p>
        </div>
      </FieldRow>
    </article>
  );
}

// ─── About Tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0, marginBottom: "20px" }}>关于财税管理系统 V2</h3>
      <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
        {[
          ["系统版本", "V2 Final (2026-05-19)"],
          ["技术栈后端", "Node.js + TypeScript + PostgreSQL 17"],
          ["技术栈前端", "React + TypeScript + Vite"],
          ["部署方式", "Docker Compose（db / api / web 三服务）"],
          ["主要功能", "账务内核、税务申报、研发财税、风险勾稽、AI 财税助手、老板专线"],
          ["AI 后端", "支持 Anthropic / OpenAI / DeepSeek / 智谱 / 通义千问 / 月之暗面 / 本地 Ollama"],
          ["业务页面", "18 个（驾驶舱 / 事项 / 任务 / 单据 / 凭证 / 总账 / 报表 / 税务 / 研发 / 风险 / 合同 / 工资 / AI秘书 / 老板专线 / PDF导出 / 审计 / 知识库 / 设置）"]
        ].map(([label, value]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "8px" }}>
            <span style={{ color: "#4d5d6c", fontWeight: 600 }}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="page-header">
        <div>
          <div className="page-title">系统设置</div>
          <div className="page-subtitle">{buildResultPageSubtitle("系统设置")}</div>
        </div>
      </div>

      <div style={{
        display: "flex",
        gap: "8px",
        background: "rgba(255,255,255,0.6)",
        borderRadius: "24px",
        border: "1px solid rgba(20,40,60,0.08)",
        padding: "6px 10px"
      }}>
        {tabBtn(tab === "company", () => setTab("company"), "公司信息")}
        {tabBtn(tab === "ai", () => setTab("ai"), "AI 配置")}
        {tabBtn(tab === "display", () => setTab("display"), "显示设置")}
        {tabBtn(tab === "about", () => setTab("about"), "关于系统")}
      </div>

      {tab === "company" && <CompanyTab />}
      {tab === "ai" && <AiConfigTab />}
      {tab === "display" && <DisplayTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}
