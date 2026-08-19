/**
 * 适配器注册的**唯一入口**（V14-A）。
 *
 * 注册散落在各处会让「这套系统到底接了哪几家银行」查不清楚。
 * 集中在一个文件，加一家就是加一行，`listRegisteredProviders()` 的
 * 结果也就有了单一出处。
 *
 * V14 只有 mock。真实实现落地时在这里加一行 `registerBankAdapter(icbcAdapter)`。
 */

import { registerBankAdapter } from "./adapter.js";
import { mockBankAdapter } from "./mock-adapter.js";

export function registerBankAdapters(): void {
  // mock 始终注册：没有它，前台配置页在无银行环境时连流程都走不通，
  // 而「走不通」会被误读成「功能没做」。
  registerBankAdapter(mockBankAdapter);
}
