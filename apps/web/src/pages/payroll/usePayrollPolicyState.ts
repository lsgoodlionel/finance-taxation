import { useState } from "react";
import type { PayrollPolicy } from "@finance-taxation/domain-model";
import { updatePayrollPolicy } from "../../lib/api";
import { policyToForm } from "./payroll-page-helpers";

export interface PayrollPolicyState {
  policy: PayrollPolicy | null;
  setPolicy: (policy: PayrollPolicy | null) => void;
  policyForm: Record<string, string>;
  setPolicyForm: (form: Record<string, string>) => void;
  editingPolicy: boolean;
  setEditingPolicy: (editing: boolean) => void;
  policyMissing: boolean;
  setPolicyMissing: (missing: boolean) => void;
  handleSavePolicy: () => Promise<void>;
}

export function usePayrollPolicyState(setMessage: (message: string) => void): PayrollPolicyState {
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<Record<string, string>>({});
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [policyMissing, setPolicyMissing] = useState(false);

  async function handleSavePolicy() {
    const updates: Record<string, number> = {};
    for (const [k, v] of Object.entries(policyForm)) {
      const n = Number(v);
      if (!isNaN(n)) updates[k] = n;
    }
    const res = await updatePayrollPolicy(updates);
    setPolicy(res.policy);
    setPolicyForm(policyToForm(res.policy));
    setEditingPolicy(false);
    setMessage("参数设置已保存。");
  }

  return {
    policy,
    setPolicy,
    policyForm,
    setPolicyForm,
    editingPolicy,
    setEditingPolicy,
    policyMissing,
    setPolicyMissing,
    handleSavePolicy
  };
}
