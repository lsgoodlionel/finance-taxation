import React from "react";
import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button, Result, Typography } from "antd";
import { isStaleChunkError, shouldReloadForStaleChunk } from "../lib/stale-chunk";

const { Paragraph, Text } = Typography;

/**
 * 路由级错误页。此前整个 router 没有 `errorElement`，任何未捕获错误都会摔到
 * React Router 的默认页 —— 一句英文「Unexpected Application Error!」加一行堆栈，
 * 对财务人员既看不懂也无从下手。
 *
 * 它同时承担一件具体的事：**版本落后导致的 chunk 加载失败自动刷新**。
 * 页面开着的时候发生了部署，内存里记的旧 chunk 文件名已经不存在，点侧边栏就会
 * 报「Importing a module script failed」。这类失败刷新一次就好，判定与防死循环
 * 见 lib/stale-chunk.ts。
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const isStale = isStaleChunkError(error);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldReloadForStaleChunk(error, window.sessionStorage)) return;
    // 用 replace 而不是 reload：把这条出错的历史记录换掉，用户按返回时
    // 不会又回到这个错误页。
    window.location.replace(window.location.href);
  }, [error]);

  if (isStale) {
    // 自动刷新已在上面触发；这里是「刷新过一次仍失败」或 sessionStorage 不可用
    // 时的落地页 —— 明确告诉用户该做什么，而不是显示一句英文报错。
    return (
      <Result
        status="warning"
        title="页面版本已更新"
        subTitle="系统刚刚发布了新版本，当前页面还是旧的。刷新一下就好，您填写中的内容不会丢失（草稿已自动保存）。"
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        }
      />
    );
  }

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error ?? "未知错误");

  return (
    <Result
      status="error"
      title="这个页面打不开了"
      subTitle="不是您的操作有问题。可以先返回上一页继续做别的事，或把下面这行信息发给技术支持。"
      extra={[
        <Button key="back" onClick={() => window.history.back()}>
          返回上一页
        </Button>,
        <Button key="reload" type="primary" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      ]}
    >
      <Paragraph>
        <Text type="secondary" copyable={{ text: detail }}>
          {detail}
        </Text>
      </Paragraph>
    </Result>
  );
}
