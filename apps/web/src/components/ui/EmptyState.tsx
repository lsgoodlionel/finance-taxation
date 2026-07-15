import React, { type ReactNode } from "react";
import { Empty, Typography } from "antd";

const { Text } = Typography;

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  image?: "default" | "simple";
};

export function EmptyState({ title, description, action, image = "simple" }: EmptyStateProps) {
  return (
    <Empty
      image={image === "simple" ? Empty.PRESENTED_IMAGE_SIMPLE : Empty.PRESENTED_IMAGE_DEFAULT}
      description={
        <div style={{ display: "grid", gap: 4 }}>
          <Text style={{ fontWeight: 600, fontSize: 13 }}>{title}</Text>
          {description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {description}
            </Text>
          )}
        </div>
      }
      style={{ padding: "24px 0", margin: 0 }}
    >
      {action}
    </Empty>
  );
}
