import React from "react";

export function TaxHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>税务中心 · 业务关系与操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(37,99,235,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(37,99,235,0.18)" }}>
            <strong>相关页面的关系</strong><br />
            <strong>经营事项页</strong>识别业务并形成税务关注点，<strong>单据中心</strong>和<strong>凭证中心</strong>提供申报依据，<strong>税务中心</strong>负责把这些结果归集为税务事项和申报批次，完成复核、申报和留档。
          </div>
          <div>
            <strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>经营事项分析后生成税务事项</li>
              <li>单据、凭证、报表为税务处理提供依据</li>
              <li>在本页按税种和期间组建申报批次</li>
              <li>完成校验、复核、申报、留档</li>
              <li>申报结果回流到归档和风险管理</li>
            </ol>
          </div>
          <div>
            <strong>本页负责什么</strong>
            <div>这里负责纳税人口径、税率规则、税务事项、申报批次和税务底稿。也就是把前面业务和账务结果，组织成真正可申报、可复核、可留档的税务资料。</div>
          </div>
          <div>
            <strong>税务事项状态</strong>
            {[["待处理", "事项已生成，尚未处理"], ["需关注", "存在潜在风险，需人工复核"], ["已申报", "已完成本期申报"], ["已逾期", "申报期已过但未完成申报"], ["免申报", "本期免于申报（如小规模纳税人等）"]].map(([status, description]) => (
              <div key={status} style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <span style={{ fontWeight: 600, minWidth: "50px" }}>{status}</span>
                <span style={{ color: "#4d5d6c" }}>{description}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            如果前面的单据、凭证、事项口径不完整，本页不应直接提交申报，应先回到上游页面补齐依据。
          </div>
        </div>
      </div>
    </div>
  );
}
