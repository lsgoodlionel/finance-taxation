import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxQualificationSection } from "./TaxQualificationSection";

/**
 * 税收资格能在公司档案里录（V17 阶段三批次 A）。
 *
 * ## 为什么这条不能省
 *
 * 判定逻辑做对了，但资格只能改库设置的话，实际效果是所有公司都停在
 * 「优惠资格待确认」——**比写死 25% 更难用**。V17 阶段一就踩过一次：
 * 判定链路打通了、界面上没有入口，于是所有业务都走兜底路径。
 *
 * 盯的是**用户点得到**——V16 红冲按钮写成两个互斥条件、护栏照样绿的教训：
 * 符号存在不等于按钮可见。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** 在 React 元素树里按 name 找一个节点。 */
function findByName(node: unknown, name: string): { props: Record<string, any> } | null {
  if (!node || typeof node !== "object") return null;
  const el = node as { props?: Record<string, any> };
  if (el.props?.name === name) return el as { props: Record<string, any> };
  const children = el.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

function render(
  profile: Record<string, unknown> = {},
  onChange: (key: string, value: unknown) => void = () => {}
): string {
  return renderToStaticMarkup(
    createElement(TaxQualificationSection, {
      profile: {
        employeeCount: null,
        totalAssetsCents: null,
        isRestrictedIndustry: false,
        highTechCertificateExpiresOn: null,
        urbanConstructionTaxZone: null,
        ...profile
      },
      onChange
    } as Parameters<typeof TaxQualificationSection>[0])
  );
}

// ── 四个字段都在页面上 ──────────────────────────────────────────────────
{
  const html = render();
  assert(html.includes("从业人数"), "小型微利的认定条件之一，要能录");
  assert(html.includes("资产总额"), "同上");
  assert(html.includes("高新"), "高新资质有效期要能录");
  assert(html.includes("城市维护建设税") || html.includes("城建税"), "城建税所在地档位要能录");
}

// ── 说清楚不填的后果 ────────────────────────────────────────────────────
{
  const html = render();
  assert(
    html.includes("待确认") || html.includes("算不出"),
    "要说明不登记就算不出税率——用户得知道这不是可有可无的选填项"
  );
  assert(
    html.includes("25%") && html.includes("5%"),
    "要说清差距有多大：本该 5% 的企业按 25% 算是多交五倍"
  );
}

// ── 空值渲染成空输入框，不是 0 ──────────────────────────────────────────
{
  // **这是最容易写错的一处。** 把 null 渲染成 0，用户看到「0 人」
  // 会以为已经登记过了，而实际上那是没登记。
  const html = render();
  const employeeInput = /name="employeeCount"[^>]*value=""/.test(html);
  assert(
    employeeInput,
    "没登记时输入框要是空的，不能显示 0——显示 0 会让用户以为已经填过"
  );
}

// ── 已登记的值渲染出来 ──────────────────────────────────────────────────
{
  const html = render({ employeeCount: 50, totalAssetsCents: 100_000_000 });
  assert(/name="employeeCount"[^>]*value="50"/.test(html), "已登记的人数要显示出来");
  assert(
    /name="totalAssetsCents"[^>]*value="1000000"/.test(html),
    "资产总额存的是分，界面上要按元显示——1 亿分 = 100 万元"
  );
}

// ── 城建税三档都在 ──────────────────────────────────────────────────────
{
  const html = render();
  assert(html.includes("市区"), "市区 7%");
  assert(html.includes("县城") || html.includes("镇"), "县城、镇 5%");
  assert(html.includes("7%") && html.includes("5%") && html.includes("1%"), "三档税率都要标出来");
}

// ── 元与分的往返不能漂移 ────────────────────────────────────────────────
{
  // 界面按元输入、库里按分存。**换算必须在一处做完**：
  // 如果输入的元值被当作分存进去，再按分转元显示，100 万会变成 1 万——
  // 而且每保存一次缩小 100 倍，用户看着数字越来越小却不知道为什么。
  const captured: Array<[string, unknown]> = [];
  renderToStaticMarkup(
    createElement(TaxQualificationSection, {
      profile: { totalAssetsCents: 100_000_000 },
      onChange: (key: string, value: unknown) => captured.push([key, value])
    } as Parameters<typeof TaxQualificationSection>[0])
  );

  // 模拟用户输入 200 万元。
  // renderToStaticMarkup 拿不到事件处理器，改用 createElement 直接取 props：
  // 组件是纯函数，调用它得到 React 元素树，从中找到资产总额那个 input。
  const tree = TaxQualificationSection({
    profile: { totalAssetsCents: 100_000_000 },
    onChange: (k, v) => captured.push([k, v])
  } as Parameters<typeof TaxQualificationSection>[0]);
  const assetsInput = findByName(tree, "totalAssetsCents");
  assert(assetsInput, "找得到资产总额输入框");
  assetsInput.props.onChange({ target: { value: "2000000" } });
  const [key, value] = captured[captured.length - 1] ?? [];
  assert(key === "totalAssetsCents", "改的是资产总额这一项");
  assert(
    value === 200_000_000,
    `输入 200 万元应当转成 200000000 分传出，实际 ${String(value)}——换算漏了就会每存一次缩小 100 倍`
  );
}

console.log("company-tax-qualification: ok");
