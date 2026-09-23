/**
 * 前后端版本漂移的提示条。
 *
 * 只升了一侧时，页面读一个后端旧版不返回的字段，报出来的错与真正的原因
 * 毫无关系——用户会去查数据、查权限，而问题在部署上。这条提示把排查
 * **引向部署**。
 *
 * 版本一致或任一侧是开发态时渲染为空：天天误报的告警等于没有告警。
 */
import React from "react";
import { Alert } from "antd";
import { describeVersionDrift } from "../../lib/release-version";

export interface VersionDriftBannerProps {
  webVersion: string;
  /** 后端 `/health` 报出的版本。拿不到时传 null——不猜。 */
  apiVersion: string | null | undefined;
}

export function VersionDriftBanner({ webVersion, apiVersion }: VersionDriftBannerProps) {
  const drift = describeVersionDrift(webVersion, apiVersion);
  if (!drift) return null;

  return (
    <Alert
      type="warning"
      showIcon
      banner
      message="前后端版本不一致"
      description={drift}
    />
  );
}
