import { useEffect, useState, useCallback } from "react";
import {
  getAiSettings,
  updateAiSettings,
  getOllamaModels,
  testAiConnection
} from "../../lib/api";
import type { AiConfigResponse, AiProviderInfo } from "../../lib/api";
import { panelStyle, SectionHeader, inputStyle } from "./settings-ui";

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

export function AiConfigTab() {
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
