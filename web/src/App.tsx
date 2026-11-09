import { OverviewPage } from "./pages/OverviewPage";
import { TunnelsPage } from "./pages/TunnelsPage";
import { CertificatesPage } from "./pages/CertificatesPage";
import { AuthoritiesPage } from "./pages/AuthoritiesPage";
import { AuditPage } from "./pages/AuditPage";
import { GuidePage } from "./pages/GuidePage";
import { ReferencePage } from "./pages/ReferencePage";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
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
  X,
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
    [preview, setPreview] = useState<{ tunnel: Tunnel; config: string } | null>(
      null,
    ),
    [detail, setDetail] = useState<Certificate | Authority | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [passwordOpen, setPasswordOpen] = useState(false),
    [busyConfirm, setBusyConfirm] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [modeFilter, setModeFilter] = useState("all");
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
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
      setDetail(null);
      setConfirmation(null);
      setPasswordOpen(false);
      notify("会话已失效，请重新登录", true);
    };
    window.addEventListener("session-expired", expire);
    const hash = () => {
      setPage(pageFromHash());
      setQuery("");
    };
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("session-expired", expire);
      window.removeEventListener("hashchange", hash);
    };
  }, [load, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (next: Page) => {
    location.hash = next;
    setPage(next);
    setQuery("");
    setMobile(false);
    setSearchOpen(false);
  };
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
  const showPreview = (tunnel: Tunnel) =>
    act(async () => {
      const data = await api<{ config: string }>(
        `/tunnels/${tunnel.id}/preview`,
      );
      setPreview({ tunnel, config: data.config });
    });
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
        <button className="button secondary" onClick={() => location.reload()}>
          重新连接
        </button>
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
    return items.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>隧道名称</th>
              <th>转发路径</th>
              {!compact && <th>关联证书</th>}
              <th>配置状态</th>
              <th className="align-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  <button
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
                  </button>
                </td>
                <td>
                  <div className="route">
                    <code>{t.accept}</code>
                    <ArrowRight size={12} />
                    <code>{t.connect}</code>
                  </div>
                </td>
                {!compact && (
                  <td>
                    <button
                      className="text-link"
                      onClick={() => {
                        const c = getCertificate(t.certificate_id);
                        if (c) setDetail(c);
                      }}
                    >
                      {getCertificate(t.certificate_id)?.name || "—"}
                    </button>
                  </td>
                )}
                <td>
                  <Badge
                    kind={
                      !t.enabled ? "disabled" : ready(t) ? "valid" : "expired"
                    }
                  >
                    {!t.enabled ? "已停用" : ready(t) ? "可部署" : "证书异常"}
                  </Badge>
                </td>
                <td>
                  <div className="row-actions">
                    {!compact && (
                      <button
                        className={`switch ${t.enabled ? "on" : ""}`}
                        role="switch"
                        aria-checked={t.enabled}
                        aria-label={`${t.enabled ? "停用" : "启用"} ${t.name}`}
                        onClick={() => toggle(t)}
                      >
                        <span />
                      </button>
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
                      onClick={() => exportFile(`/tunnels/${t.id}/bundle`)}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <Brand />
        <nav>
          {pages.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "tunnels" && snapshot.tunnels.length > 0 && (
                <span className="nav-count">{snapshot.tunnels.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <nav aria-label="说明页面">
            {helpPages.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
              >
                <BookOpen size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="user">
            <span className="user-avatar">
              {status.username.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <button
                className="user-name"
                aria-label="修改管理员密码"
                onClick={() => setPasswordOpen(true)}
              >
                <strong>{status.username}</strong>
              </button>
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
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-trigger"
              onClick={() => {
                setSearchOpen(true);
                setQuery("");
              }}
            >
              <Search size={15} />
              <span>搜索资源</span>
            </button>
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
              <button
                className="button primary"
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
              </button>
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
      {preview && (
        <Modal
          title={preview.tunnel.name}
          description="stunnel.conf"
          onClose={() => setPreview(null)}
          wide
        >
          <div className="preview-meta">
            <Badge kind={preview.tunnel.mode === "server" ? "valid" : "blue"}>
              {preview.tunnel.mode === "server" ? "服务端模式" : "客户端模式"}
            </Badge>
            <span>{preview.tunnel.tls_min}+</span>
            <button className="text-link" onClick={() => copy(preview.config)}>
              <Copy size={14} />
              复制配置
            </button>
          </div>
          <pre className="config-preview">
            <code>
              {preview.config.split("\n").map((line, i) => (
                <span
                  className={
                    line.startsWith(";")
                      ? "code-comment"
                      : line.startsWith("[")
                        ? "code-section"
                        : ""
                  }
                  key={i}
                >
                  <span className="line-number">{i + 1}</span>
                  {line || " "}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={!ready(preview.tunnel)}
              onClick={() => exportFile(`/tunnels/${preview.tunnel.id}/config`)}
            >
              <FileCode2 size={15} />
              仅配置文件
            </button>
            <button
              className="button primary"
              disabled={!ready(preview.tunnel)}
              onClick={() => exportFile(`/tunnels/${preview.tunnel.id}/bundle`)}
            >
              <Download size={15} />
              下载部署包
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.name}
          description={
            "purpose" in detail ? "证书详情 · X.509" : "证书颁发机构 · Root CA"
          }
          onClose={() => setDetail(null)}
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
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDetail(null)}
            >
              关闭
            </button>
            <button
              className="button primary"
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
              <Download size={15} />
              {"purpose" in detail ? "下载证书包" : "下载 CA 证书"}
            </button>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          onClose={() => {
            if (!busyConfirm) setConfirmation(null);
          }}
        >
          <div className="confirm-body">
            <span className="confirm-icon">
              <ShieldX size={26} />
            </span>
            <p>{confirmation.description}</p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busyConfirm}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              className="button danger"
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
            </button>
          </div>
        </Modal>
      )}
      {searchOpen && (
        <Modal title="搜索工作空间" onClose={() => setSearchOpen(false)}>
          <div className="filter-input global-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="搜索所有资源"
              placeholder="输入名称…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
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
                  <button
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
                  </button>
                ))}
                {group.items.length === 0 && <p>无匹配资源</p>}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <ShieldX size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <IconButton
            icon={X}
            label="关闭通知"
            onClick={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
}
