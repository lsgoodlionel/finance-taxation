import type { PayrollPolicy } from "@finance-taxation/domain-model";
import { EmptyState } from "../../components/ui/EmptyState";
import { PayrollPolicyForm } from "./PayrollPolicyForm";
import { PayrollPolicySection } from "./PayrollPolicySection";
import { fmt, panelStyle, pct } from "./payroll-page-helpers";

export interface PayrollPolicyTabPanelProps {
  policy: PayrollPolicy | null;
  policyForm: Record<string, string>;
  editingPolicy: boolean;
  policyMissing: boolean;
  onPolicyFormChange: (form: Record<string, string>) => void;
  onStartEdit: () => void;
  onSave: () => Promise<void>;
  onCancelEdit: () => void;
}

export function PayrollPolicyTabPanel({
  policy,
  policyForm,
  editingPolicy,
  policyMissing,
  onPolicyFormChange,
  onStartEdit,
  onSave,
  onCancelEdit
}: PayrollPolicyTabPanelProps) {
  return (
    <PayrollPolicySection
      content={(
        policy ? (
          <PayrollPolicyForm
            editing={editingPolicy}
            form={policyForm}
            onChange={onPolicyFormChange}
            onStartEdit={onStartEdit}
            onSave={onSave}
            onCancel={onCancelEdit}
            formatAmount={fmt}
            formatPercent={pct}
          />
        ) : (
          <div style={panelStyle()}>
            <EmptyState
              title="尚未配置工资参数口径"
              description={
                policyMissing
                  ? "当前账套还没有社保、公积金和个税参数。请由具备工资管理权限的人员先完成参数配置，再进入工资计算。"
                  : "当前未加载到工资参数，请稍后重试。"
              }
            />
          </div>
        )
      )}
    />
  );
}
