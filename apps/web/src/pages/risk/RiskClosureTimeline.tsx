import type { RiskClosureRecord } from "@finance-taxation/domain-model";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

type RiskClosureTimelineProps = {
  selectedFindingId: string;
  records: RiskClosureRecord[];
};

export function RiskClosureTimeline({ selectedFindingId, records }: RiskClosureTimelineProps) {
  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0 }}>异常关闭与复盘记录</h3>
      <p>当前查看：{selectedFindingId || "未选择风险发现"}</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>复盘编号</th>
            <th style={cellStyle()}>关闭人</th>
            <th style={cellStyle()}>关闭说明</th>
            <th style={cellStyle()}>复核时间</th>
          </tr>
        </thead>
        <tbody>
          {records.length ? records.map((record) => (
            <tr key={record.id}>
              <td style={cellStyle()}>{record.id}</td>
              <td style={cellStyle()}>{record.closedByName}</td>
              <td style={cellStyle()}>{record.resolution}</td>
              <td style={cellStyle()}>{record.reviewedAt}</td>
            </tr>
          )) : (
            <tr>
              <td style={cellStyle()} colSpan={4}>暂无关闭记录。</td>
            </tr>
          )}
        </tbody>
      </table>
    </article>
  );
}
