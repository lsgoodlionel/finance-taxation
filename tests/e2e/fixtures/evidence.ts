import type { TestInfo } from "@playwright/test";

export async function attachBusinessObject(
  testInfo: TestInfo,
  name: string,
  value: Record<string, unknown>
): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json"
  });
}
