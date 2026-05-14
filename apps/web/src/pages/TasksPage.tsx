const taskStates = ["not_started", "in_progress", "in_review", "blocked", "done"];

export function TasksPage() {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.82)",
        borderRadius: "24px",
        border: "1px solid rgba(20,40,60,0.08)",
        padding: "24px"
      }}
    >
      <h2 style={{ marginTop: 0 }}>任务中心占位页</h2>
      <p style={{ lineHeight: 1.8 }}>
        这里将承接任务树、SLA、审批流、阻塞原因、催办记录和责任人工作台。
      </p>
      <h3>首批状态</h3>
      <ul style={{ paddingLeft: "22px", lineHeight: 2 }}>
        {taskStates.map((state) => (
          <li key={state}>{state}</li>
        ))}
      </ul>
    </section>
  );
}
