import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../../utils/http.js";

export function handleChairmanDashboard(_req: IncomingMessage, res: ServerResponse) {
  return json(res, 200, {
    cards: [
      { key: "cash", label: "可动用资金", value: "2,480,000", trend: "+8.6%" },
      { key: "receivables", label: "待回款金额", value: "1,320,000", trend: "-3.2%" },
      { key: "tax", label: "本月预计税负", value: "286,000", trend: "+1.4%" },
      { key: "risk", label: "高风险事项", value: "7", trend: "+2" }
    ],
    queues: {
      approvals: 4,
      blockedTasks: 6,
      overdueTasks: 3
    }
  });
}
