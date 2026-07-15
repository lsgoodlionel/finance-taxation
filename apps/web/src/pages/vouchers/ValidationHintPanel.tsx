import { Typography } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { BalanceIndicator } from "./BalanceIndicator";
import { buildValidationHints, type ValidationLineInput } from "./validation-hints";

const { Text } = Typography;

interface ValidationResult {
  valid: boolean;
  totals: { debit: string; credit: string };
  issues: string[];
}

interface ValidationHintPanelProps {
  result: ValidationResult;
  lines?: readonly ValidationLineInput[];
}

/**
 * V7 L3：校验结果 = 借贷合计指示条 + 结构化「差在哪 / 怎么修」建议列表。
 */
export function ValidationHintPanel({ result, lines }: ValidationHintPanelProps) {
  const hints = buildValidationHints({
    valid: result.valid,
    totals: result.totals,
    issues: result.issues,
    lines,
  });

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <BalanceIndicator result={{ ...result, issues: hints.length > 0 ? [] : result.issues }} />
      {hints.length > 0 && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid rgba(220,38,38,0.16)",
            background: "rgba(220,38,38,0.04)",
            padding: "10px 12px",
            display: "grid",
            gap: 8,
          }}
        >
          <Text strong style={{ fontSize: 12, color: "#991b1b" }}>
            <ToolOutlined style={{ marginRight: 6 }} />
            修复建议
          </Text>
          {hints.map((hint) => (
            <div key={hint.key} style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ color: "#991b1b" }}>{hint.problem}</div>
              <div style={{ color: "#64748b" }}>修复：{hint.advice}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
