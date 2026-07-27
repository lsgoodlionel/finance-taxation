import { activateOnEnterOrSpace, isActivationKey } from "./a11y";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── isActivationKey：只有 Enter / Space 视为激活键 ──────────────────────────
assert(isActivationKey("Enter"), "expected Enter to be an activation key");
assert(isActivationKey(" "), "expected Space to be an activation key");
assert(!isActivationKey("Tab"), "expected Tab to not be an activation key");
assert(!isActivationKey("a"), "expected a plain letter key to not be an activation key");

// ── activateOnEnterOrSpace：Enter/Space 触发回调并阻止默认行为；其它键不触发 ──
function makeFakeKeyboardEvent(key: string) {
  let prevented = false;
  return {
    event: { key, preventDefault: () => { prevented = true; } } as unknown as Parameters<
      ReturnType<typeof activateOnEnterOrSpace>
    >[0],
    wasPrevented: () => prevented
  };
}

const counter = { activated: 0 };
function getActivatedCount(): number {
  return counter.activated;
}
const handler = activateOnEnterOrSpace(() => { counter.activated += 1; });

const enterCase = makeFakeKeyboardEvent("Enter");
handler(enterCase.event);
assert(getActivatedCount() === 1, "expected Enter to call onActivate");
assert(enterCase.wasPrevented(), "expected Enter to call preventDefault (avoid double-activation)");

const spaceCase = makeFakeKeyboardEvent(" ");
handler(spaceCase.event);
assert(getActivatedCount() === 2, "expected Space to call onActivate");
assert(spaceCase.wasPrevented(), "expected Space to call preventDefault (avoid page scroll)");

const otherCase = makeFakeKeyboardEvent("ArrowDown");
handler(otherCase.event);
assert(getActivatedCount() === 2, "expected other keys to not call onActivate");
assert(!otherCase.wasPrevented(), "expected other keys to leave default behavior untouched");
