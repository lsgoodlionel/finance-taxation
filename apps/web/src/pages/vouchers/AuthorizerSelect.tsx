/**
 * 过账终审人选择器（V16）。
 *
 * ## 为什么需要它
 *
 * 过账是高风险动作，服务端要求**终审人 ≠ 执行人**。而此前前端的
 * `postVoucher()` 写死发空 body，于是前台**完全无法过账任何一张凭证**：
 * 每次都 400 `WORKFLOW_AUTHORIZATION_REQUIRED`，还以未翻译的英文弹出来。
 *
 * 六个角色的操作实验里，财务负责人在页面上一张凭证都过不了——
 * 而 API 层的过账测试全是绿的，因为测试直接把 `authorizerUserId` 传进去了。
 *
 * ## 名单从哪来
 *
 * 服务端按 `permission=ledger.post` 过滤，不是前端按角色猜。
 * 当前用户会被排除掉——他是执行人，选自己必然撞职责冲突。
 */
import { useEffect, useState } from "react";
import { Alert, Select, Typography } from "antd";
import { Term } from "../../components/ui/Term";
import { listCompanyMembers, type CompanyMember } from "../../lib/api-events";

export interface AuthorizerSelectProps {
  /** 当前操作人（执行人），会被从候选里排除。 */
  currentUserId: string;
  onChange: (userId: string) => void;
}

export function AuthorizerSelect({ currentUserId, onChange }: AuthorizerSelectProps) {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listCompanyMembers("ledger.post")
      .then((data) => {
        if (cancelled) return;
        // 执行人不能同时是终审人——把自己留在列表里只会让人选中后被服务端拒绝。
        setMembers(data.items.filter((m) => m.id !== currentUserId));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 名单加载失败要说出来。静默的空下拉框会让人以为「公司里没有别人有记账权」，
        // 然后去找管理员加权限——而真正的问题在接口上。
        setError(err instanceof Error ? err.message : "终审人名单加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  if (error) {
    return <Alert type="error" showIcon message="终审人名单加载失败" description={error} />;
  }

  if (!loading && members.length === 0) {
    // 单人公司的真实处境：没有第二个有记账权的人，这张凭证就是过不了账。
    // 说清楚原因和出路，而不是给一个空下拉框。
    return (
      <Alert
        type="warning"
        showIcon
        message="没有可选的终审人"
        description={
          <span>
            <Term k="posting">过账</Term>
            要求终审人与操作人是两个人。公司里目前没有其他持记账权限的成员，
            请先在系统设置里给同事分配「会计」或「财务负责人」角色。
          </span>
        }
      />
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>
        终审人（必填）
      </Typography.Text>
      <Select
        style={{ width: "100%" }}
        loading={loading}
        placeholder="选择为这次过账负责的终审人"
        options={members.map((m) => ({ value: m.id, label: m.displayName || m.username }))}
        onChange={onChange}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        <Term k="posting">过账</Term>是高风险动作，要求终审人与操作人不是同一个人。
      </Typography.Text>
    </div>
  );
}
