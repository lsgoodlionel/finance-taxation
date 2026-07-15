import { useState } from "react";
import { useI18n, type Lang } from "../../lib/i18n";
import { panelStyle, SectionHeader, FieldRow } from "./settings-ui";

// ─── Display Tab ──────────────────────────────────────────────────────────────

export function DisplayTab() {
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
