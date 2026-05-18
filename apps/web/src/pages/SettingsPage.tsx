import { useEffect, useState } from "react";
import { getCompanyProfile, updateCompanyProfile, getAiSettings } from "../lib/api";
import type { CompanyProfile } from "../lib/api";

type Tab = "company" | "ai" | "about";

interface AiSettings {
  provider: "anthropic" | "ollama";
  anthropicConfigured: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  note: string;
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "28px"
  } as const;
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
      <label style={{ color: "#4d5d6c", fontSize: "13px", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [editProfile, setEditProfile] = useState<Partial<CompanyProfile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCompanyProfile().then((p) => {
      setProfile(p);
      setEditProfile(p);
    }).catch((e: Error) => setMessage(e.message));

    void (getAiSettings as () => Promise<AiSettings>)().then(setAiSettings)
      .catch((e: Error) => setMessage(e.message));
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await updateCompanyProfile({
        name: editProfile.name,
        registeredAddress: editProfile.registeredAddress,
        contactEmail: editProfile.contactEmail,
        contactPhone: editProfile.contactPhone
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

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div className="page-header">
        <div>
          <div className="page-title">系统设置</div>
          <div className="page-subtitle">管理公司信息、AI 配置与系统参数</div>
        </div>
      </div>

      {message && (
        <div className="alert alert-info">{message}</div>
      )}

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          background: "rgba(255,255,255,0.6)",
          borderRadius: "24px",
          border: "1px solid rgba(20,40,60,0.08)",
          padding: "6px 10px"
        }}
      >
        {tabBtn(tab === "company", () => setTab("company"), "公司信息")}
        {tabBtn(tab === "ai", () => setTab("ai"), "AI 配置")}
        {tabBtn(tab === "about", () => setTab("about"), "关于系统")}
      </div>

      {/* 公司信息 */}
      {tab === "company" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0, marginBottom: "24px" }}>公司基本信息</h3>
          {profile ? (
            <>
              <FieldRow label="公司 ID">
                <span style={{ color: "#4d5d6c", fontFamily: "monospace", fontSize: "13px" }}>{profile.id}</span>
              </FieldRow>
              <FieldRow label="公司名称">
                <input
                  value={editProfile.name ?? ""}
                  onChange={(e) => setEditProfile({ ...editProfile, name: e.target.value })}
                  style={{ width: "100%", maxWidth: "360px" }}
                />
              </FieldRow>
              <FieldRow label="注册地址">
                <input
                  value={editProfile.registeredAddress ?? ""}
                  onChange={(e) => setEditProfile({ ...editProfile, registeredAddress: e.target.value })}
                  placeholder="选填"
                  style={{ width: "100%", maxWidth: "360px" }}
                />
              </FieldRow>
              <FieldRow label="联系邮箱">
                <input
                  type="email"
                  value={editProfile.contactEmail ?? ""}
                  onChange={(e) => setEditProfile({ ...editProfile, contactEmail: e.target.value })}
                  placeholder="选填"
                  style={{ width: "100%", maxWidth: "360px" }}
                />
              </FieldRow>
              <FieldRow label="联系电话">
                <input
                  value={editProfile.contactPhone ?? ""}
                  onChange={(e) => setEditProfile({ ...editProfile, contactPhone: e.target.value })}
                  placeholder="选填"
                  style={{ width: "100%", maxWidth: "360px" }}
                />
              </FieldRow>
              <div style={{ marginTop: "20px" }}>
                <button
                  onClick={() => void saveProfile()}
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? "保存中…" : "保存公司信息"}
                </button>
              </div>
            </>
          ) : (
            <div className="state-loading">加载中…</div>
          )}
        </article>
      )}

      {/* AI 配置 */}
      {tab === "ai" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0, marginBottom: "24px" }}>AI 后端配置</h3>
          {aiSettings ? (
            <>
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: "16px",
                  background: aiSettings.anthropicConfigured
                    ? "rgba(39,174,96,0.08)"
                    : "rgba(52,152,219,0.08)",
                  border: `1px solid ${aiSettings.anthropicConfigured ? "rgba(39,174,96,0.2)" : "rgba(52,152,219,0.2)"}`,
                  marginBottom: "20px"
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                  {aiSettings.anthropicConfigured ? "✅ Anthropic Claude" : "🤖 本地 Ollama"}
                </div>
                <div style={{ color: "#4d5d6c", fontSize: "13px" }}>{aiSettings.note}</div>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px", fontSize: "14px" }}>
                  <span style={{ color: "#4d5d6c", fontWeight: 600 }}>当前后端</span>
                  <span>{aiSettings.provider === "anthropic" ? "Anthropic Claude" : "Ollama（本地）"}</span>
                </div>
                {!aiSettings.anthropicConfigured && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4d5d6c", fontWeight: 600 }}>Ollama 地址</span>
                      <code style={{ fontSize: "12px", background: "#f5f5f5", padding: "2px 8px", borderRadius: "4px" }}>
                        {aiSettings.ollamaBaseUrl}
                      </code>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4d5d6c", fontWeight: 600 }}>使用模型</span>
                      <code style={{ fontSize: "12px", background: "#f5f5f5", padding: "2px 8px", borderRadius: "4px" }}>
                        {aiSettings.ollamaModel}
                      </code>
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: "20px", padding: "14px 16px", background: "rgba(20,40,60,0.04)", borderRadius: "12px", fontSize: "13px", color: "#4d5d6c" }}>
                <strong>如何切换 AI 后端：</strong><br />
                修改 <code>apps/api/.env.docker</code> 文件中的 <code>ANTHROPIC_API_KEY</code>（填入则优先使用 Claude）
                或 <code>OLLAMA_BASE_URL</code> + <code>OLLAMA_MODEL</code>（保持 key 为空则使用 Ollama）。
                修改后重启 API 容器生效。
              </div>
            </>
          ) : (
            <div className="state-loading">加载中…</div>
          )}
        </article>
      )}

      {/* 关于系统 */}
      {tab === "about" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0, marginBottom: "20px" }}>关于财税管理系统 V2</h3>
          <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
            {[
              ["系统版本", "V2 Phase 3 (2026-05-18)"],
              ["技术栈后端", "Node.js + TypeScript + PostgreSQL 17"],
              ["技术栈前端", "React + TypeScript + Vite"],
              ["部署方式", "Docker Compose（db / api / web 三服务）"],
              ["主要功能", "账务内核、税务申报、研发财税、风险勾稽、AI 财税助手、老板专线"],
              ["AI 后端", "Anthropic Claude / 本地 Ollama（二选一）"]
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "8px" }}
              >
                <span style={{ color: "#4d5d6c", fontWeight: 600 }}>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
