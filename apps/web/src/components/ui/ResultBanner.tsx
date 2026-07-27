import React from "react";

type ResultBannerProps = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

/**
 * a11y：error 用 role="alert"（隐含 aria-live="assertive"，立即打断播报），
 * 其余语气用 role="status"（隐含 aria-live="polite"，排队播报）——
 * 让横幅这类动态状态提示能被屏幕阅读器感知（WCAG 2.2 · SC 4.1.3）。
 */
export function ResultBanner({ tone, message }: ResultBannerProps) {
  return (
    <div className="v3-banner" data-tone={tone} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      {message}
    </div>
  );
}
