const cards = [
  { label: "可动用资金", value: "¥2,480,000", hint: "未来 30 天预计净流入 +8.6%" },
  { label: "待回款金额", value: "¥1,320,000", hint: "其中逾期 3 笔，需老板关注" },
  { label: "本月预计税负", value: "¥286,000", hint: "一般纳税人标准计税口径" },
  { label: "高风险事项", value: "7", hint: "收入确认、研发归集、工资资料" }
];

const queues = [
  "待审批事项 4 个：付款、红字发票、研发外包合同补签、税务批次确认",
  "阻塞任务 6 个：主要卡在发票、验收单、研发工时记录",
  "逾期任务 3 个：客户回款催办、社保补充资料、资产验收归档"
];

const milestones = [
  "TASK-01-01：角色、权限、数据域模型首版",
  "TASK-02-01：business_events / tasks 统一对象",
  "TASK-03-01：董事长首页静态骨架",
  "TASK-04-01：自然语言交办入口待承接",
  "TASK-05-01：任务树与 SLA 待设计"
];

function cardStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    boxShadow: "0 18px 60px rgba(20,40,60,0.08)"
  } as const;
}

export function ChairmanDashboardPage() {
  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={{ ...cardStyle(), padding: "28px" }}>
        <h2 style={{ fontSize: "38px", margin: "0 0 16px" }}>董事长驾驶舱静态骨架</h2>
        <p style={{ margin: 0, fontSize: "18px", lineHeight: 1.8 }}>
          当前页面用于承接 V2 老板首页。下一步将在这套结构上继续接入回款、现金流、
          风险、审批与 AI 工作摘要的真实数据源。
        </p>
      </article>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px"
        }}
      >
        {cards.map((card) => (
          <article key={card.label} style={{ ...cardStyle(), padding: "18px" }}>
            <div style={{ color: "#6c7a89", fontSize: "14px" }}>{card.label}</div>
            <div style={{ fontSize: "30px", margin: "10px 0 6px", fontWeight: 700 }}>
              {card.value}
            </div>
            <div style={{ color: "#4d5d6c", fontSize: "14px", lineHeight: 1.6 }}>
              {card.hint}
            </div>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "20px" }}>
        <article style={{ ...cardStyle(), padding: "24px" }}>
          <h3 style={{ marginTop: 0 }}>老板待处理队列</h3>
          <ul style={{ paddingLeft: "22px", lineHeight: 2 }}>
            {queues.map((queue) => (
              <li key={queue}>{queue}</li>
            ))}
          </ul>
        </article>

        <article style={{ ...cardStyle(), padding: "24px" }}>
          <h3 style={{ marginTop: 0 }}>Sprint 0 第二批任务</h3>
          <ul style={{ paddingLeft: "22px", lineHeight: 2 }}>
            {milestones.map((milestone) => (
              <li key={milestone}>{milestone}</li>
            ))}
          </ul>
        </article>
      </section>
    </section>
  );
}
