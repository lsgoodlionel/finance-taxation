const eventFields = [
  "type",
  "title",
  "occurredOn",
  "amount",
  "department",
  "status",
  "ownerId",
  "counterpartyId",
  "projectId"
];

export function EventsPage() {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.82)",
        borderRadius: "24px",
        border: "1px solid rgba(20,40,60,0.08)",
        padding: "24px"
      }}
    >
      <h2 style={{ marginTop: 0 }}>经营事项总线占位页</h2>
      <p style={{ lineHeight: 1.8 }}>
        这里将承接 `business_events` 列表、详情页、AI 分析摘要、关联对象与审计时间轴。
      </p>
      <h3>首批字段</h3>
      <ul style={{ paddingLeft: "22px", lineHeight: 2 }}>
        {eventFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </section>
  );
}
