#!/usr/bin/env bash
# V3.0 参考仓库克隆脚本
# 用途：将开源财税/ERP 参考仓库克隆到本地 reference/ 目录
#       在 V3.0 升级开发过程中，直接参考本地代码，无需联网
# 文档：docs/v3-upgrade-spec.md → 第四章"参考仓库索引"
#
# 使用方法：
#   chmod +x scripts/clone-references.sh
#   ./scripts/clone-references.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REF_DIR="$ROOT_DIR/reference"

mkdir -p "$REF_DIR"
cd "$REF_DIR"

echo "📦 开始克隆 V3.0 参考仓库到 $REF_DIR"
echo "────────────────────────────────────────────"

clone_if_missing() {
  local name="$1"
  local url="$2"
  local desc="$3"
  if [ -d "$name" ]; then
    echo "✅ 已存在：$name  ($desc)"
  else
    echo "⬇️  克隆中：$name  ($desc)"
    git clone --depth 1 "$url" "$name"
    echo "✅ 完成：$name"
  fi
}

# ── 核心财税/ERP 参考仓库 ─────────────────────────────────

# ★5846  AI 收据分析、OCR、shadcn/ui、Next.js+Prisma
clone_if_missing "TaxHacker" \
  "https://github.com/vas3k/TaxHacker.git" \
  "AI 票据分析助手（★5846）"

# ★3676  antd 完整用法、Dashboard 图表、Drawer 模式、Invoice/Expense UX
clone_if_missing "bigcapital" \
  "https://github.com/bigcapitalhq/bigcapital.git" \
  "开源财务系统，antd 最佳实践（★3676）"

# ★1062  中文协作记账 Web App，Vite+React+TypeScript
clone_if_missing "Cent" \
  "https://github.com/glink25/Cent.git" \
  "中文账本 UI（★1062）"

# ★4654  frappe 出品，双式记账凭证录入，TypeScript
clone_if_missing "books" \
  "https://github.com/frappe/books.git" \
  "双式记账凭证录入（★4654）"

# ★9  HR/工资/考勤完整流程，Node+React+TypeScript
clone_if_missing "HR-management" \
  "https://github.com/diorwave/HR-management.git" \
  "工资/HR 管理模块（★9）"

# ★853  极简发票 Drawer UI
clone_if_missing "Invio" \
  "https://github.com/kittendevv/Invio.git" \
  "发票极简 UI（★853）"

# ★14  Xero/QuickBooks 风格 ERP，Zod+RHF 表单，Recharts 图表
clone_if_missing "dubbl" \
  "https://github.com/dubbl-org/dubbl.git" \
  "Xero 风格 ERP，图表+报表（★14）"

# ★4  开源 ERP，双入账，VAT 报表
clone_if_missing "accountinghub" \
  "https://github.com/jovbcorreia/accountinghub.git" \
  "开源 ERP 全流程（★4）"

# ★2  中文记账桌面应用，React+Electron
clone_if_missing "ZhiZhang-Desktop" \
  "https://github.com/yuaanlin/ZhiZhang-Desktop.git" \
  "中文记账 Electron（★2）"

# ★1  同技术栈（Node+React+TS+PG），税务合规（VAT/个税）
clone_if_missing "Tunisian-ERP" \
  "https://github.com/HamdiFersi1/Tunisian-ERP.git" \
  "税务合规，同技术栈（★1）"

echo ""
echo "────────────────────────────────────────────"
echo "🎉 全部参考仓库就绪！共 $(ls -d */ | wc -l | tr -d ' ') 个"
echo ""
echo "📖 参考使用指南：docs/v3-upgrade-spec.md → 第四章"
echo ""
echo "快速路径速查："
echo "  antd Table/Drawer 用法  → reference/bigcapital/packages/webapp/src/containers/"
echo "  Dashboard 图表          → reference/bigcapital/packages/webapp/src/containers/Dashboard/"
echo "  AI 对话 + OCR           → reference/TaxHacker/components/transactions/"
echo "  凭证录入（双式）         → reference/books/src/"
echo "  工资计算流程             → reference/HR-management/"
echo "  中文账本 UI             → reference/Cent/src/pages/"
echo "  Zod+RHF 表单            → reference/dubbl/app/"
