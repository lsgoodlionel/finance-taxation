export function DocumentsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "620px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>单据中心 · 业务关系与操作说明</h3>
          <button onClick={onClose} aria-label="关闭说明" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.18)" }}>
            <strong>三个中心的关系</strong><br />
            <strong>任务中心</strong>负责告诉谁去做、先做什么；<strong>单据中心</strong>负责沉淀原始资料、业务单据和附件；<strong>凭证中心</strong>负责把单据转成正式会计凭证并过账。标准顺序通常是：<strong>事项分析 → 任务分发 → 单据补齐 → 凭证审核过账</strong>。
          </div>
          <div><strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>AI 财税秘书或经营事项页识别业务，自动生成任务</li>
              <li>任务中心分配给财务、业务、行政或税务岗位执行</li>
              <li>单据中心补齐发票、回单、审批单、附件索引等资料</li>
              <li>凭证中心根据单据生成和审核记账凭证</li>
              <li>过账后进入总账、报表、税务和归档流程</li>
            </ol>
          </div>
          <div><strong>单据中心负责什么</strong>
            <div>这里重点管理“原始业务资料是否齐全”。包括发票、付款凭证、合同、审批单、附件索引、验收或招待说明等。单据完整，凭证才有依据，税务和审计才可追溯。</div>
          </div>
          <div><strong>本页常见操作</strong>
            <div>1. 在左侧选择单据；2. 在右侧查看正式单据内容；3. 上传附件；4. 下载已归档附件；5. 单据资料完整后执行归档。</div>
          </div>
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            ⚠️ 如果单据缺资料，不建议直接推进凭证过账。应先回到任务中心或事项页补齐责任人和附件要求。
          </div>
        </div>
      </div>
    </div>
  );
}
