import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Layout, Menu, Avatar, Button, Form, Input, Card, Typography, Divider, Spin, Drawer, Grid,
} from "antd";
import {
  RobotOutlined, UnorderedListOutlined, CheckSquareOutlined, DashboardOutlined,
  FileTextOutlined, TeamOutlined, FolderOpenOutlined, AuditOutlined, BarChartOutlined,
  LineChartOutlined, CalculatorOutlined, ExperimentOutlined, AlertOutlined, FileSearchOutlined,
  BookOutlined, ExportOutlined, SettingOutlined, PoweroffOutlined, SafetyOutlined, MenuOutlined,
} from "@ant-design/icons";
import { AUTH_EXPIRED_EVENT, getStoredToken, getCurrentUser, login, logoutSession } from "../lib/api";
import { LOGIN_GATE_SUBTITLE, SIDEBAR_BRAND_SUBTITLE } from "../lib/entry-guidance";

const { Sider, Content } = Layout;
const { Text } = Typography;

interface User {
  id: string;
  username: string;
  displayName: string;
  roleIds: string[];
}

const navItems = [
  {
    key: "g-entry",
    label: "业务入口",
    type: "group" as const,
    children: [
      { key: "/assistant", icon: <RobotOutlined />, label: "AI 财税助手" },
      { key: "/events", icon: <UnorderedListOutlined />, label: "经营事项总线" },
      { key: "/tasks", icon: <CheckSquareOutlined />, label: "任务中心" },
      { key: "/dashboard/chairman", icon: <DashboardOutlined />, label: "董事长驾驶舱" },
    ],
  },
  {
    key: "g-mgmt",
    label: "经营管理",
    type: "group" as const,
    children: [
      { key: "/contracts", icon: <FileTextOutlined />, label: "合同管理" },
      { key: "/payroll", icon: <TeamOutlined />, label: "工资管理" },
    ],
  },
  {
    key: "g-finance",
    label: "财务运营",
    type: "group" as const,
    children: [
      { key: "/documents", icon: <FolderOpenOutlined />, label: "单据中心" },
      { key: "/vouchers", icon: <AuditOutlined />, label: "凭证中心" },
      { key: "/ledger", icon: <BarChartOutlined />, label: "总账中心" },
      { key: "/reports", icon: <LineChartOutlined />, label: "财务报表" },
    ],
  },
  {
    key: "g-tax",
    label: "税务人力",
    type: "group" as const,
    children: [
      { key: "/tax", icon: <CalculatorOutlined />, label: "税务中心" },
    ],
  },
  {
    key: "g-risk",
    label: "研发风控",
    type: "group" as const,
    children: [
      { key: "/rnd", icon: <ExperimentOutlined />, label: "研发辅助账" },
      { key: "/risk", icon: <AlertOutlined />, label: "风险勾稽" },
      { key: "/audit", icon: <FileSearchOutlined />, label: "审计日志" },
    ],
  },
  {
    key: "g-tools",
    label: "AI 与工具",
    type: "group" as const,
    children: [
      { key: "/knowledge", icon: <BookOutlined />, label: "制度库" },
      { key: "/pdf-export", icon: <ExportOutlined />, label: "PDF 导出" },
    ],
  },
  {
    key: "g-sys",
    label: "系统",
    type: "group" as const,
    children: [
      { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
    ],
  },
];

function LoginGate({ onLogin }: { onLogin: (user: User) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm();

  async function handleSubmit(values: { username: string; password: string }) {
    setError("");
    setLoading(true);
    try {
      const result = await login(values.username, values.password);
      onLogin(result.user as User);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
    }}>
      <Card
        style={{ width: 400, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        styles={{ body: { padding: "40px 36px" } }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}>
            <SafetyOutlined style={{ fontSize: 26, color: "#fff" }} />
          </div>
          <Typography.Title level={4} style={{ margin: 0, color: "#0f172a" }}>
            Finance Taxation
          </Typography.Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{LOGIN_GATE_SUBTITLE}</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmit} size="large">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input placeholder="请输入用户名" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#fee2e2", borderRadius: 6 }}>
              {error}
            </div>
          )}
          <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, fontSize: 15 }}>
            {loading ? "登录中…" : "登 录"}
          </Button>
        </Form>

        <Divider style={{ margin: "20px 0 12px" }} />
        <Text type="secondary" style={{ fontSize: 12, display: "block", textAlign: "center" }}>
          默认账户：<Text code style={{ fontSize: 12 }}>chairman / 123456</Text>
          &nbsp;|&nbsp;
          <Text code style={{ fontSize: 12 }}>finance / 123456</Text>
        </Text>
      </Card>
    </div>
  );
}

const { useBreakpoint } = Grid;

export function AppLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setChecking(false); return; }
    getCurrentUser()
      .then(u => setUser(u as User))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      setUser(null);
      navigate("/", { replace: true });
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [navigate]);

  async function handleLogout() {
    try { await logoutSession(); } catch {
      localStorage.removeItem("finance-taxation-v2-token");
      localStorage.removeItem("finance-taxation-v2-refresh-token");
    }
    setUser(null);
    navigate("/");
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
        <Spin size="large" tip="加载中…" />
      </div>
    );
  }

  if (!user) return <LoginGate onLogin={setUser} />;

  const initials = (user.displayName || user.username || "U").slice(0, 2).toUpperCase();
  const roleLabel =
    user.roleIds.includes("role-chairman") || user.roleIds.includes("chairman") ? "董事长" :
    user.roleIds.includes("role-finance-director") || user.roleIds.includes("cfo") ? "财务总监" :
    user.roleIds.includes("role-accountant") || user.roleIds.includes("accountant") ? "会计" : "成员";

  // Shared sidebar content for both desktop Sider and mobile Drawer
  const sidebarContent = (showFull: boolean) => (
    <div style={{ background: "#0f172a", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Brand */}
      <div style={{
        padding: showFull ? "18px 16px 14px" : "18px 0 14px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        textAlign: showFull ? "left" : "center",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 9,
          background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          marginBottom: showFull ? 8 : 0,
        }}>
          <SafetyOutlined style={{ color: "#fff", fontSize: 17 }} />
        </div>
        {showFull && (
          <>
            <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
              Finance Taxation
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>
              {SIDEBAR_BRAND_SUBTITLE}
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          style={{ background: "transparent", border: "none", fontSize: 13 }}
          items={navItems}
          inlineCollapsed={!showFull}
          onClick={({ key }) => {
            navigate(key);
            if (isMobile) setDrawerOpen(false);
          }}
          aria-label="主导航菜单"
        />
      </div>

      {/* User footer */}
      <div style={{
        padding: showFull ? "10px 14px" : "10px 0",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", gap: 8,
        justifyContent: showFull ? "flex-start" : "center",
      }}>
        <Avatar
          size={30}
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", flexShrink: 0, fontSize: 12, cursor: "default" }}
          aria-label={`当前用户：${user.displayName || user.username}`}
        >
          {initials}
        </Avatar>
        {showFull && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.displayName || user.username}
              </div>
              <div style={{ color: "#475569", fontSize: 11 }}>{roleLabel}</div>
            </div>
            <Button
              type="text"
              icon={<PoweroffOutlined style={{ fontSize: 13 }} />}
              size="small"
              onClick={handleLogout}
              aria-label="退出登录"
              title="退出登录"
              style={{ color: "#475569", padding: "0 4px" }}
            />
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Layout style={{ minHeight: "100vh", background: "#f1f5f9" }}>
        {/* Mobile top header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "#0f172a", padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <Button
            type="text"
            icon={<MenuOutlined style={{ color: "#f1f5f9", fontSize: 18 }} />}
            onClick={() => setDrawerOpen(true)}
            aria-label="打开导航菜单"
            style={{ padding: "0 4px" }}
          />
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          }}>
            <SafetyOutlined style={{ color: "#fff", fontSize: 14 }} />
          </div>
          <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700 }}>Finance Taxation</span>
        </div>

        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={256}
          styles={{ body: { padding: 0, background: "#0f172a" }, header: { display: "none" } }}
          aria-label="导航抽屉"
        >
          {sidebarContent(true)}
        </Drawer>

        <Content style={{ padding: "16px" }}>
          <Outlet />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={224}
        collapsedWidth={64}
        style={{
          background: "#0f172a",
          boxShadow: "2px 0 8px rgba(0,0,0,0.15)",
          overflow: "hidden",
          height: "100vh",
          position: "fixed",
          left: 0, top: 0, bottom: 0,
        }}
        aria-label="侧边导航栏"
      >
        {sidebarContent(!collapsed)}
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 64 : 224, transition: "margin-left 0.2s", background: "#f1f5f9", minHeight: "100vh" }}>
        <Content style={{ padding: "24px 28px" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
