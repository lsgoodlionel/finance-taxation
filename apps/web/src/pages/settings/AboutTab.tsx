import { panelStyle } from "./settings-ui";

// ─── About Tab ────────────────────────────────────────────────────────────────

export function AboutTab() {
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
