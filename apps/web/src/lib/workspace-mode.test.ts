import { deriveDefaultMode, readStoredMode } from "./workspace-mode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// 非财务角色 → guided（董事长也是 guided：老板端白话轨）
assert(deriveDefaultMode(["role-chairman"]) === "guided", "expected role-chairman to default to guided");
assert(deriveDefaultMode(["role-employee"]) === "guided", "expected role-employee to default to guided");
assert(deriveDefaultMode(["role-viewer"]) === "guided", "expected role-viewer to default to guided");

// 财务专业角色 → pro
assert(deriveDefaultMode(["role-finance-director"]) === "pro", "expected role-finance-director to default to pro");
assert(deriveDefaultMode(["role-accountant"]) === "pro", "expected role-accountant to default to pro");
assert(deriveDefaultMode(["role-cashier"]) === "pro", "expected role-cashier to default to pro");
assert(deriveDefaultMode(["role-tax-specialist"]) === "pro", "expected role-tax-specialist to default to pro");
assert(deriveDefaultMode(["role-auditor"]) === "pro", "expected role-auditor to default to pro");

// 无 role- 前缀的角色码同样识别
assert(deriveDefaultMode(["cfo"]) === "pro", "expected bare cfo code to default to pro");
assert(deriveDefaultMode(["accountant"]) === "pro", "expected bare accountant code to default to pro");

// 混合角色：含任一财务角色即 pro
assert(deriveDefaultMode(["role-chairman", "role-accountant"]) === "pro", "expected mixed roles with finance role to default to pro");
assert(deriveDefaultMode(["role-employee", "role-viewer"]) === "guided", "expected mixed non-finance roles to stay guided");

// 空角色 → guided（最保守的白话轨）
assert(deriveDefaultMode([]) === "guided", "expected empty roles to default to guided");

// readStoredMode 合法性：只接受 guided/pro，其余（含异常）一律返回 null
function stubWindowStorage(getItem: () => string | null): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem, setItem: () => undefined },
  };
}

stubWindowStorage(() => null);
assert(readStoredMode() === null, "expected null when nothing stored");

stubWindowStorage(() => "guided");
assert(readStoredMode() === "guided", "expected stored guided to be read back");

stubWindowStorage(() => "pro");
assert(readStoredMode() === "pro", "expected stored pro to be read back");

stubWindowStorage(() => "banana");
assert(readStoredMode() === null, "expected invalid stored value to be rejected");

stubWindowStorage(() => {
  throw new Error("storage denied");
});
assert(readStoredMode() === null, "expected storage failure to degrade to null");

delete (globalThis as { window?: unknown }).window;

console.log("workspace-mode-ok");
