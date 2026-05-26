import React from "react";

type ResultBannerProps = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

export function ResultBanner({ tone, message }: ResultBannerProps) {
  return (
    <div className="v3-banner" data-tone={tone}>
      {message}
    </div>
  );
}
