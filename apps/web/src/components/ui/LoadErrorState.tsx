/**
 * 列表加载失败时的占位——**与「没有数据」严格分开**。
 *
 * ## 为什么要这个组件
 *
 * 多个列表页的写法是 `catch { toast.error(...) }`，然后表格照常显示
 * 「暂无往来单位」。**toast 会消失，空态不会**——几秒之后屏幕上只剩下
 * 一句「暂无往来单位」，而那是假的：数据存在，只是这个账号读不到。
 *
 * V16 角色实验里，税务专员被研发页那句「还没有研发项目」误导过：
 * 他的本职工作就是归集加计扣除，看到这句话会去问业务部门为什么不立项，
 * 而真正的问题在权限上。
 *
 * ## 为什么权限错误要单独说
 *
 * 403 和网络故障，用户该做的事完全不同：一个去找管理员开权限，
 * 一个是重试或报障。给同一句「加载失败」等于让用户自己猜。
 */
import React from "react";
import { Alert } from "antd";

/** 后端 403 的几种文案写法。认漏了就退化成通用错误，用户又不知道该找谁。 */
const FORBIDDEN_PATTERNS = [/forbidden/i, /\b403\b/, /missing permission/i, /权限不足/, /无权/];

/** 从错误文案里挖出权限码，例如 `missing permission rnd.view` → `rnd.view`。 */
const PERMISSION_CODE = /(?:missing permission|permission)[:\s]+([a-z_]+\.[a-z_]+)/i;

export type LoadFailure = {
  kind: "forbidden" | "other";
  /** 缺失的权限码，识别不出时为 null。 */
  permission: string | null;
  /** 给用户的下一步建议。 */
  advice: string;
};

export function describeLoadFailure(error: string): LoadFailure {
  const isForbidden = FORBIDDEN_PATTERNS.some((pattern) => pattern.test(error));
  if (!isForbidden) {
    return {
      kind: "other",
      permission: null,
      advice: "可以刷新重试；一直失败的话把这条错误信息发给技术支持。"
    };
  }

  const matched = PERMISSION_CODE.exec(error);
  const permission = matched?.[1] ?? null;
  return {
    kind: "forbidden",
    permission,
    advice: permission
      ? `当前账号没有 ${permission} 权限，请找管理员开通后再看这个页面。`
      : "当前账号没有读取这些数据的权限，请找管理员开通。"
  };
}

export interface LoadErrorStateProps {
  /** 什么没加载出来，例如「往来单位」。 */
  subject: string;
  error: string;
}

export function LoadErrorState({ subject, error }: LoadErrorStateProps) {
  const failure = describeLoadFailure(error);

  return (
    <Alert
      type="error"
      showIcon
      message={`${subject}没有加载出来`}
      description={
        <span>
          {error}
          <br />
          {failure.advice}
          <br />
          <strong>这不是「暂无{subject}」</strong>
          ——是读不到数据，请不要按当前画面下判断。
        </span>
      }
    />
  );
}
