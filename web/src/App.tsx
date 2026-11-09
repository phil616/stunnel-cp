import { TunnelRoute } from "./components/TunnelRoute";
import {
  Drawer,
  TextInput,
  Switch,
  Button,
  Table,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { TunnelExport } from "./components/TunnelExport";
import type { Platform } from "./components/TunnelExport";
import { navigateSafely } from "./hooks/useUnsavedChanges";
import { OverviewPage } from "./pages/OverviewPage";
import { TunnelsPage } from "./pages/TunnelsPage";
import { CertificatesPage } from "./pages/CertificatesPage";
import { AuthoritiesPage } from "./pages/AuthoritiesPage";
import { AuditPage } from "./pages/AuditPage";
import { GuidePage } from "./pages/GuidePage";
import { ReferencePage } from "./pages/ReferencePage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  FileCode2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, certificateState, date, download, emptySnapshot } from "./api";
import type { Authority, Certificate, Snapshot, Status, Tunnel } from "./api";
import {
  Brand,
  Badge,
  CertBadge,
  IconButton,
  Empty,
  Modal,
} from "./components/ui";
import { PasswordModal } from "./components/PasswordModal";
import { Login } from "./components/Login";
import { EditorModal } from "./components/EditorModal";
import type { Editor } from "./components/EditorModal";
import { tunnelInput, errorMessage } from "./format";

import type { Page, Confirmation } from "./types";
const pages: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "工作台", icon: LayoutDashboard },
  { id: "tunnels", label: "隧道配置", icon: Network },
  { id: "certificates", label: "证书管理", icon: FileCode2 },
  { id: "authorities", label: "证书颁发机构", icon: ShieldCheck },
  { id: "audit", label: "操作记录", icon: Activity },
];
const helpPages: { id: Page; label: string }[] = [
  { id: "guide", label: "部署说明" },
  { id: "pki-guide", label: "证书说明" },
  { id: "operations", label: "运维说明" },
];
const pageFromHash = (): Page => {
  const hash = location.hash.slice(1);
  return [...pages, ...helpPages].some((p) => p.id === hash)
    ? (hash as Page)
    : "overview";
};

export function App() {
  const [status, setStatus] = useState<Status | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot),
    [fatal, setFatal] = useState(""),
    [page, setPage] = useState<Page>(pageFromHash),
    [editor, setEditor] = useState<Editor>(null),
    [preview, setPreview] = useState<Tunnel | null>(null),
    [exportTunnel, setExportTunnel] = useState<Tunnel | null>(null),
    [platform, setPlatform] = useState<Platform>("unix"),
    [detail, setDetail] = useState<Certificate | Authority | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [passwordOpen, setPasswordOpen] = useState(false),
    [busyConfirm, setBusyConfirm] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [modeFilter, setModeFilter] = useState("all");
  const currentPage = useRef(page);
  currentPage.current = page;
  const notify = useCallback((message: string, error = false) => {
    notifications.show({
      message,
      color: error ? "red" : "forest",
      role: error ? "alert" : "status",
      autoClose: 4500,
    });
  }, []);
  const load = useCallback(async () => {
    const current = await api<Status>("/status");
    setStatus(current);
    if (current.authenticated) setSnapshot(await api<Snapshot>("/snapshot"));
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setSnapshot(await api<Snapshot>("/snapshot"));
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setRefreshing(false);
    }
  }, [notify]);
  useEffect(() => {
    load().catch((e) => setFatal(errorMessage(e)));
    const expire = () => {
      setStatus((s) => (s ? { ...s, authenticated: false } : s));
      setSnapshot(emptySnapshot);
      setMobile(false);
      setSearchOpen(false);
      setEditor(null);
      setPreview(null);
      setExportTunnel(null);
      setDetail(null);
      setConfirmation(null);
      setPasswordOpen(false);
      notify("会话已失效，请重新登录", true);
    };
    window.addEventListener("session-expired", expire);
    const hash = () => {
      const next = pageFromHash();
      history.replaceState(null, "", `#${currentPage.current}`);
      navigateSafely(() => {
        history.replaceState(null, "", `#${next}`);
        setPage(next);
        setEditor(null);
        setPasswordOpen(false);
        setQuery("");
      });
    };
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("session-expired", expire);
      window.removeEventListener("hashchange", hash);
    };
  }, [load, notify]);
  const go = (next: Page) =>
    navigateSafely(() => {
      history.pushState(null, "", `#${next}`);
      setPage(next);
      setQuery("");
      setMobile(false);
      setSearchOpen(false);
      setEditor(null);
      setPasswordOpen(false);
    });
  const act = async (
    action: () => Promise<unknown>,
    success?: string,
    refreshAfter = true,
  ) => {
    try {
      await action();
      if (success) notify(success);
      if (refreshAfter) await refresh();
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  const getCertificate = (id: string) =>
    snapshot.certificates.find((c) => c.id === id);
  const exportFile = (path: string) => act(() => download(path), "下载已开始");
  const showPreview = (tunnel: Tunnel) => setPreview(tunnel);
  const toggle = (t: Tunnel) =>
    act(
      () =>
        api(
          `/tunnels/${t.id}`,
          "PUT",
          tunnelInput({ ...t, enabled: !t.enabled }),
        ),
      t.enabled ? "配置已停用" : "配置已启用",
    );
  const revoke = (c: Certificate) =>
    setConfirmation({
      title: `吊销证书「${c.name}」`,
      description: "不可撤销。请更新所有部署节点的 CRL 并重载 stunnel。",
      action: async () => {
        await api(`/certificates/${c.id}/revoke`, "POST");
        notify("证书已吊销，请同步更新部署节点的 CRL");
        await refresh();
      },
    });
  const deleteTunnel = (t: Tunnel) =>
    setConfirmation({
      title: `删除隧道「${t.name}」`,
      description: "永久删除配置，保留证书。已部署进程需手动停止。",
      action: async () => {
        await api(`/tunnels/${t.id}`, "DELETE");
        notify("隧道配置已删除");
        await refresh();
      },
    });
  const validCerts = snapshot.certificates.filter((c) =>
    ["valid", "expiring"].includes(certificateState(c)),
  );
  const ready = (t: Tunnel) =>
    t.enabled && validCerts.some((c) => c.id === t.certificate_id);
  const filteredTunnels = snapshot.tunnels.filter(
    (t) =>
      (modeFilter === "all" || t.mode === modeFilter) &&
      `${t.name} ${t.description} ${t.accept} ${t.connect}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const filteredCerts = snapshot.certificates.filter((c) =>
    `${c.name} ${c.common_name} ${c.sans.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const filteredCAs = snapshot.authorities.filter((a) =>
    `${a.name} ${a.organization}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("已复制到剪贴板");
    } catch {
      notify("浏览器未授予剪贴板权限，请手动复制", true);
    }
  }
  if (fatal)
    return (
      <div className="center-screen">
        <ShieldX size={35} />
        <h2>暂时无法连接控制台</h2>
        <p>{fatal}</p>
        <Button variant="default" onClick={() => location.reload()}>
          重新连接
        </Button>
      </div>
    );
  if (!status)
    return (
      <div className="center-screen">
        <LoaderCircle className="spin" size={30} />
        <p>正在连接控制台…</p>
      </div>
    );
  if (!status.authenticated) return <Login status={status} onSuccess={load} />;
  const titles: Record<Page, string> = {
    overview: "工作台",
    tunnels: "隧道配置",
    certificates: "证书管理",
    authorities: "证书颁发机构",
    audit: "操作记录",
    guide: "部署说明",
    "pki-guide": "证书说明",
    operations: "运维说明",
  };
  const current = titles[page];
  function tunnelTable(items: Tunnel[], compact = false) {
    if (compact && items.length)
      return (
        <ul className="recent-tunnels">
          {items.map((t) => (
            <li key={t.id}>
              <div className="recent-tunnel-heading">
                <UnstyledButton
                  className="resource-name"
                  onClick={() => showPreview(t)}
                >
                  <span
                    className={`table-icon ${t.mode === "client" ? "blue" : ""}`}
                  >
                    <Network size={17} />
                  </span>
                  <span>
                    <strong title={t.name}>{t.name}</strong>
                    <small>{t.mode === "server" ? "服务端" : "客户端"}</small>
                  </span>
                </UnstyledButton>
                <Badge
                  kind={
                    !t.enabled ? "disabled" : ready(t) ? "valid" : "expired"
                  }
                >
                  {!t.enabled ? "已停用" : ready(t) ? "可部署" : "证书异常"}
                </Badge>
              </div>
              <div className="recent-tunnel-footer">
                <TunnelRoute tunnel={t} />
                <div className="row-actions">
                  <IconButton
                    icon={FileCode2}
                    label={`预览 ${t.name}`}
                    onClick={() => showPreview(t)}
                  />
                  <IconButton
                    icon={Download}
                    label={`下载 ${t.name} 部署包`}
                    disabled={!ready(t)}
                    onClick={() => setExportTunnel(t)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      );
    return items.length ? (
      <div className="table-scroll">
        <Table className="resource-table tunnel-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>隧道名称</Table.Th>
              <Table.Th>转发路径</Table.Th>
              {!compact && <Table.Th>关联证书</Table.Th>}
              <Table.Th>配置状态</Table.Th>
              <Table.Th className="align-right">操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td className="resource-primary">
                  <UnstyledButton
                    className="resource-name"
                    onClick={() => showPreview(t)}
                  >
                    <span
                      className={`table-icon ${t.mode === "client" ? "blue" : ""}`}
                    >
                      <Network size={17} />
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.mode === "server" ? "服务端" : "客户端"}</small>
                    </span>
                  </UnstyledButton>
                </Table.Td>
                <Table.Td
                  className="resource-field resource-route"
                  data-label="转发路径"
                >
                  <TunnelRoute tunnel={t} />
                </Table.Td>
                {!compact && (
                  <Table.Td
                    className="resource-field resource-secondary"
                    data-label="关联证书"
                  >
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      onClick={() => {
                        const c = getCertificate(t.certificate_id);
                        if (c) setDetail(c);
                      }}
                    >
                      {getCertificate(t.certificate_id)?.name || "—"}
                    </Button>
                  </Table.Td>
                )}
                <Table.Td className="resource-status">
                  <Badge
                    kind={
                      !t.enabled ? "disabled" : ready(t) ? "valid" : "expired"
                    }
                  >
                    {!t.enabled ? "已停用" : ready(t) ? "可部署" : "证书异常"}
                  </Badge>
                </Table.Td>
                <Table.Td className="resource-actions">
                  <div className="row-actions">
                    {!compact && (
                      <Switch
                        className="tunnel-toggle"
                        checked={t.enabled}
                        aria-label={`${t.enabled ? "停用" : "启用"} ${t.name}`}
                        onChange={() => toggle(t)}
                      />
                    )}
                    <IconButton
                      icon={FileCode2}
                      label={`预览 ${t.name}`}
                      onClick={() => showPreview(t)}
                    />
                    {!compact && (
                      <IconButton
                        icon={Pencil}
                        label={`编辑 ${t.name}`}
                        onClick={() => setEditor({ type: "tunnel", tunnel: t })}
                      />
                    )}
                    <IconButton
                      icon={Download}
                      label={`下载 ${t.name} 部署包`}
                      disabled={!ready(t)}
                      onClick={() => setExportTunnel(t)}
                    />
                    {!compact && (
                      <IconButton
                        icon={Trash2}
                        danger
                        label={`删除 ${t.name}`}
                        onClick={() => deleteTunnel(t)}
                      />
                    )}
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    ) : (
      <Empty
        icon={Network}
        title="暂无隧道"
        action={() => setEditor({ type: "tunnel" })}
        label="新建隧道"
      />
    );
  }
  const username = status.username;
  function sidebarContent() {
    return (
      <>
        <Brand />
        <nav>
          {pages.map(({ id, label, icon: Icon }) => (
            <UnstyledButton
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "tunnels" && snapshot.tunnels.length > 0 && (
                <span className="nav-count">{snapshot.tunnels.length}</span>
              )}
            </UnstyledButton>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <nav aria-label="说明页面">
            {helpPages.map((item) => (
              <UnstyledButton
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
              >
                <BookOpen size={18} />
                <span>{item.label}</span>
              </UnstyledButton>
            ))}
          </nav>
          <div className="user">
            <span className="user-avatar">
              {username.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <UnstyledButton
                className="user-name"
                aria-label="修改管理员密码"
                onClick={() => {
                  setMobile(false);
                  setPasswordOpen(true);
                }}
              >
                <strong>{username}</strong>
              </UnstyledButton>
            </span>
            <IconButton
              icon={LogOut}
              label="退出登录"
              onClick={() =>
                act(
                  async () => {
                    await api("/auth/logout", "POST");
                    setSnapshot(emptySnapshot);
                    setMobile(false);
                    setSearchOpen(false);
                    await load();
                  },
                  undefined,
                  false,
                )
              }
            />
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebarContent()}</aside>
      <Drawer
        opened={mobile}
        onClose={() => setMobile(false)}
        title="工作空间"
        size={264}
        padding="md"
        closeButtonProps={{ "aria-label": "关闭导航" }}
      >
        <div className="mobile-sidebar">{sidebarContent()}</div>
      </Drawer>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <UnstyledButton
              className="mobile-menu"
              aria-label="打开导航"
              title="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </UnstyledButton>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="top-actions">
            <UnstyledButton
              className="search-trigger"
              onClick={() => {
                setSearchOpen(true);
                setQuery("");
              }}
            >
              <Search size={15} />
              <span>搜索资源</span>
            </UnstyledButton>
            <span
              className="system-status"
              role="img"
              aria-label="已连接"
              title="已连接"
            >
              <span className="status-dot" />
            </span>
            <IconButton
              icon={RefreshCw}
              label="刷新数据"
              disabled={refreshing}
              onClick={refresh}
            />
            <span className="top-divider" />
            <IconButton
              icon={CircleHelp}
              label="查看说明"
              onClick={() =>
                go(
                  ["certificates", "authorities"].includes(page)
                    ? "pki-guide"
                    : "guide",
                )
              }
            />
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <h1>{current}</h1>
            </div>
            {["overview", "tunnels", "certificates", "authorities"].includes(
              page,
            ) && (
              <Button
                variant="filled"
                onClick={() =>
                  setEditor({
                    type:
                      page === "authorities"
                        ? "ca"
                        : page === "certificates"
                          ? "cert"
                          : "tunnel",
                  })
                }
              >
                <Plus size={17} />
                {page === "authorities"
                  ? "创建 CA"
                  : page === "certificates"
                    ? "签发证书"
                    : "新建隧道"}
              </Button>
            )}
          </div>
          {page === "overview" && (
            <OverviewPage
              snapshot={snapshot}
              go={go}
              tunnelTable={tunnelTable}
              ready={ready}
            />
          )}
          {page === "tunnels" && (
            <TunnelsPage
              snapshot={snapshot}
              modeFilter={modeFilter}
              setModeFilter={setModeFilter}
              query={query}
              setQuery={setQuery}
              filteredTunnels={filteredTunnels}
              tunnelTable={tunnelTable}
            />
          )}
          {page === "certificates" && (
            <CertificatesPage
              snapshot={snapshot}
              query={query}
              setQuery={setQuery}
              filteredCerts={filteredCerts}
              setDetail={setDetail}
              exportFile={exportFile}
              revoke={revoke}
              setEditor={setEditor}
            />
          )}
          {page === "authorities" && (
            <AuthoritiesPage
              snapshot={snapshot}
              setDetail={setDetail}
              exportFile={exportFile}
              copy={copy}
              setConfirmation={setConfirmation}
              refresh={refresh}
              notify={notify}
              setEditor={setEditor}
            />
          )}
          {page === "audit" && <AuditPage snapshot={snapshot} />}
          {page === "guide" && <GuidePage setEditor={setEditor} copy={copy} />}
          {(page === "pki-guide" || page === "operations") && (
            <ReferencePage page={page} copy={copy} />
          )}
        </main>
      </div>
      {passwordOpen && (
        <PasswordModal
          onClose={() => setPasswordOpen(false)}
          onSaved={() => {
            setPasswordOpen(false);
            notify("密码已更新，其他会话已失效");
            void refresh();
          }}
        />
      )}
      {editor && (
        <EditorModal
          key={`${editor.type}:${editor.tunnel?.id || "new"}`}
          editor={editor}
          snapshot={snapshot}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            notify("保存成功");
            await refresh();
          }}
          onSwitch={(type) => setEditor({ type })}
        />
      )}
      {(preview || exportTunnel) && (
        <TunnelExport
          key={`${(preview || exportTunnel)!.id}:${!!preview}`}
          tunnel={(preview || exportTunnel)!}
          preview={!!preview}
          platform={platform}
          setPlatform={setPlatform}
          onClose={() => {
            setPreview(null);
            setExportTunnel(null);
          }}
          ready={ready((preview || exportTunnel)!)}
          notify={notify}
          copy={copy}
        />
      )}
      {detail && (
        <Modal
          title={detail.name}
          description={
            "purpose" in detail ? "证书详情 · X.509" : "证书颁发机构 · Root CA"
          }
          onClose={() => setDetail(null)}
          footer={
            <>
              <Button variant="default" onClick={() => setDetail(null)}>
                关闭
              </Button>
              <Button
                variant="filled"
                leftSection={<Download size={15} />}
                disabled={
                  "purpose" in detail &&
                  !["valid", "expiring"].includes(certificateState(detail))
                }
                onClick={() =>
                  exportFile(
                    "purpose" in detail
                      ? `/certificates/${detail.id}/bundle`
                      : `/authorities/${detail.id}/certificate`,
                  )
                }
              >
                {"purpose" in detail ? "下载证书包" : "下载 CA 证书"}
              </Button>
            </>
          }
        >
          <dl className="detail-list">
            {"purpose" in detail && (
              <>
                <div>
                  <dt>通用名称</dt>
                  <dd>{detail.common_name}</dd>
                </div>
                <div>
                  <dt>证书用途</dt>
                  <dd>
                    {detail.purpose === "server" ? "服务端认证" : "客户端认证"}
                  </dd>
                </div>
                <div>
                  <dt>主题备用名称</dt>
                  <dd>{detail.sans.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>
                    <CertBadge certificate={detail} />
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>密钥算法</dt>
              <dd>{detail.algorithm}</dd>
            </div>
            <div>
              <dt>生效时间</dt>
              <dd>{date(detail.not_before)}</dd>
            </div>
            <div>
              <dt>到期时间</dt>
              <dd>{date(detail.not_after)}</dd>
            </div>
            <div>
              <dt>证书序列号</dt>
              <dd className="mono break-all">{detail.serial}</dd>
            </div>
            <div className="detail-fingerprint">
              <dt>
                SHA-256 指纹{" "}
                <IconButton
                  icon={Copy}
                  label="复制证书指纹"
                  onClick={() => copy(detail.fingerprint)}
                />
              </dt>
              <dd className="mono break-all">
                {detail.fingerprint.match(/.{1,2}/g)?.join(":")}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          closeOnClickOutside={false}
          busy={busyConfirm}
          onClose={() => {
            if (!busyConfirm) setConfirmation(null);
          }}
          footer={
            <>
              <Button
                variant="default"
                disabled={busyConfirm}
                onClick={() => setConfirmation(null)}
              >
                取消
              </Button>
              <Button
                variant="light"
                color="red"
                disabled={busyConfirm}
                onClick={async () => {
                  setBusyConfirm(true);
                  try {
                    await confirmation.action();
                    setConfirmation(null);
                  } catch (e) {
                    notify(errorMessage(e), true);
                  } finally {
                    setBusyConfirm(false);
                  }
                }}
              >
                {busyConfirm && <LoaderCircle size={15} className="spin" />}
                确认操作
              </Button>
            </>
          }
        >
          <div className="confirm-body">
            <span className="confirm-icon">
              <ShieldX size={26} />
            </span>
            <p>{confirmation.description}</p>
          </div>
        </Modal>
      )}
      {searchOpen && (
        <Modal title="搜索工作空间" onClose={() => setSearchOpen(false)}>
          <TextInput
            autoFocus
            aria-label="搜索所有资源"
            placeholder="输入名称…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftSection={<Search size={17} />}
            mb="lg"
          />
          <div className="search-results">
            {[
              {
                title: "隧道配置",
                items: filteredTunnels,
                page: "tunnels" as Page,
              },
              {
                title: "证书管理",
                items: filteredCerts,
                page: "certificates" as Page,
              },
              {
                title: "证书颁发机构",
                items: filteredCAs,
                page: "authorities" as Page,
              },
            ].map((group) => (
              <div key={group.page}>
                <span className="mini-label">{group.title}</span>
                {group.items.slice(0, 6).map((item) => (
                  <UnstyledButton
                    key={item.id}
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery("");
                      if ("mode" in item) {
                        go("tunnels");
                        void showPreview(item);
                      } else setDetail(item);
                    }}
                  >
                    <span>{item.name}</span>
                    <ArrowUpRight size={14} />
                  </UnstyledButton>
                ))}
                {group.items.length === 0 && <p>无匹配资源</p>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
