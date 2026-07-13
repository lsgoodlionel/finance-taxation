import { Spin } from "antd";

/**
 * Suspense fallback shown while a lazily-loaded route chunk is fetched.
 * Centered within the content area so layout does not jump.
 */
export function RouteFallback() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "40vh"
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <Spin size="large" />
    </div>
  );
}
