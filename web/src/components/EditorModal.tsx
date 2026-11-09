import { useState } from "react";
import type { FormEvent } from "react";
import {
  Server,
  Globe2,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  KeyRound,
  Check,
} from "lucide-react";
import { api, certificateState, date } from "../api";
import type { Snapshot, Tunnel } from "../api";
import { errorMessage } from "../format";
import { Field, Modal } from "./ui";
import { CertificateHelp } from "./CertificateHelp";
export type Editor = { type: "ca" | "cert" | "tunnel"; tunnel?: Tunnel } | null;
export function EditorModal({
  editor,
  snapshot,
  onClose,
  onSaved,
  onSwitch,
}: {
  editor: NonNullable<Editor>;
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSwitch: (type: "ca" | "cert" | "tunnel") => void;
}) {
  const t = editor.tunnel,
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState(t?.mode || "server"),
    [purpose, setPurpose] = useState("server");
  const usableCAs = snapshot.authorities.filter(
    (a) => new Date(a.not_after).getTime() > Date.now(),
  );
  const certificates = snapshot.certificates.filter(
    (c) =>
      c.purpose === mode &&
      (["valid", "expiring"].includes(certificateState(c)) ||
        c.id === t?.certificate_id),
  );
  const blocked =
    (editor.type === "cert" && !usableCAs.length) ||
    (editor.type === "tunnel" && !certificates.length);
  const close = () => {
    if (!busy) onClose();
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (key: string) => String(f.get(key) || "").trim();
    setBusy(true);
    setError("");
    try {
      if (editor.type === "ca")
        await api("/authorities", "POST", {
          name: get("name"),
          organization: get("organization"),
          algorithm: get("algorithm"),
          days: Number(get("days")),
        });
      else if (editor.type === "cert")
        await api("/certificates", "POST", {
          name: get("name"),
          common_name: get("common_name"),
          ca_id: get("ca_id"),
          purpose,
          algorithm: get("algorithm"),
          days: Number(get("days")),
          sans: get("sans")
            .split(/[\s,，]+/)
            .filter(Boolean),
        });
      else
        await api(t ? `/tunnels/${t.id}` : "/tunnels", t ? "PUT" : "POST", {
          name: get("name"),
          description: get("description"),
          mode,
          accept: get("accept"),
          connect: get("connect"),
          certificate_id: get("certificate_id"),
          peer_name: get("peer_name"),
          tls_min: get("tls_min"),
          enabled: f.get("enabled") === "on",
        });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        editor.type === "ca"
          ? "创建证书颁发机构"
          : editor.type === "cert"
            ? "签发证书"
            : t
              ? "编辑隧道配置"
              : "新建隧道配置"
      }
      onClose={close}
    >
      <form onSubmit={submit} key={editor.type}>
        {editor.type === "ca" && (
          <>
            <Field label="CA 名称">
              <input
                name="name"
                placeholder="例如：Production Root CA"
                required
                maxLength={80}
                autoFocus
              />
            </Field>
            <Field label="组织名称">
              <input
                name="organization"
                placeholder="例如：Acme Infrastructure"
                required
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label="密钥算法">
                <select name="algorithm" defaultValue="ECDSA-P256">
                  <option>ECDSA-P256</option>
                  <option>RSA-3072</option>
                </select>
              </Field>
              <Field label="有效期（天）">
                <input
                  name="days"
                  type="number"
                  required
                  min={1}
                  max={7300}
                  defaultValue={3650}
                />
              </Field>
            </div>
          </>
        )}
        {editor.type === "cert" && (
          <>
            <Field label="签发 CA">
              <select name="ca_id" required defaultValue="">
                <option value="" disabled>
                  选择证书颁发机构
                </option>
                {usableCAs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {!usableCAs.length && (
              <div className="inline-warning">
                需要先创建有效的 CA。
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onSwitch("ca")}
                >
                  创建 CA
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="form-grid">
              <Field label="证书名称">
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="例如：redis-server"
                />
              </Field>
              <Field label="通用名称（CN）">
                <input
                  name="common_name"
                  required
                  maxLength={64}
                  placeholder="例如：redis.example.com"
                />
              </Field>
            </div>
            <Field label="证书用途">
              <div className="segmented">
                <button
                  type="button"
                  className={purpose === "server" ? "selected" : ""}
                  onClick={() => setPurpose("server")}
                >
                  <Server size={16} />
                  服务端认证
                </button>
                <button
                  type="button"
                  className={purpose === "client" ? "selected" : ""}
                  onClick={() => setPurpose("client")}
                >
                  <Globe2 size={16} />
                  客户端认证
                </button>
              </div>
            </Field>
            <Field
              label={`主题备用名称（SAN）${purpose === "client" ? " · 可选" : ""}`}
              hint={
                purpose === "server"
                  ? "服务端必填；DNS 或 IP，逗号或换行分隔。"
                  : "DNS 或 IP，逗号或换行分隔。"
              }
            >
              <textarea
                name="sans"
                placeholder="redis.example.com, 10.0.0.10"
                required={purpose === "server"}
                rows={2}
                maxLength={16000}
              />
            </Field>
            <CertificateHelp context="certificate" />
            <div className="form-grid">
              <Field label="密钥算法">
                <select name="algorithm" defaultValue="ECDSA-P256">
                  <option>ECDSA-P256</option>
                  <option>RSA-3072</option>
                </select>
              </Field>
              <Field label="有效期（天）" hint="不能超过 CA 剩余有效期。">
                <input
                  name="days"
                  type="number"
                  required
                  min={1}
                  max={825}
                  defaultValue={365}
                />
              </Field>
            </div>
          </>
        )}
        {editor.type === "tunnel" && (
          <>
            <Field label="隧道名称" hint="1–64 位字母、数字、_ 或 -。">
              <input
                name="name"
                defaultValue={t?.name}
                required
                maxLength={64}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]*"
                placeholder="例如：redis-production"
                autoFocus
              />
            </Field>
            <Field label="描述 · 可选">
              <input
                name="description"
                defaultValue={t?.description}
                maxLength={500}
                placeholder="可选"
              />
            </Field>
            <Field label="工作模式">
              <div className="segmented">
                <button
                  type="button"
                  className={mode === "server" ? "selected" : ""}
                  onClick={() => setMode("server")}
                >
                  <Server size={16} />
                  服务端
                </button>
                <button
                  type="button"
                  className={mode === "client" ? "selected" : ""}
                  onClick={() => setMode("client")}
                >
                  <Globe2 size={16} />
                  客户端
                </button>
              </div>
            </Field>
            <div className="form-grid" key={mode}>
              <Field label="监听地址（accept）">
                <input
                  name="accept"
                  defaultValue={
                    t?.mode === mode
                      ? t.accept
                      : mode === "server"
                        ? "0.0.0.0:6380"
                        : "127.0.0.1:16379"
                  }
                  required
                  placeholder="127.0.0.1:端口"
                />
              </Field>
              <Field label="转发目标（connect）">
                <input
                  name="connect"
                  defaultValue={
                    t?.mode === mode
                      ? t.connect
                      : mode === "server"
                        ? "127.0.0.1:6379"
                        : "redis.example.com:6380"
                  }
                  required
                  placeholder="主机名或 IP:端口"
                />
              </Field>
            </div>
            <Field label="身份认证证书">
              <select
                name="certificate_id"
                key={mode}
                required
                defaultValue={t?.mode === mode ? t.certificate_id : ""}
              >
                <option value="" disabled>
                  选择{mode === "server" ? "服务端" : "客户端"}证书
                </option>
                {certificates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {date(c.not_after)} 到期
                  </option>
                ))}
              </select>
            </Field>
            {!certificates.length && (
              <div className="inline-warning">
                暂无可用的{mode === "server" ? "服务端" : "客户端"}证书。
                <button
                  className="text-link"
                  type="button"
                  onClick={() => onSwitch("cert")}
                >
                  签发证书
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            {mode === "client" && (
              <>
                <Field
                  label="服务端证书身份（DNS / IP）"
                  hint="填写预期服务端 SAN 中的域名或 IP，可与转发目标不同。"
                >
                  <input
                    name="peer_name"
                    defaultValue={t?.peer_name}
                    required
                    placeholder="redis.example.com"
                  />
                </Field>
                <CertificateHelp context="client" />
              </>
            )}
            <Field label="最低 TLS 版本">
              <select name="tls_min" defaultValue={t?.tls_min || "TLSv1.2"}>
                <option value="TLSv1.2">TLS 1.2</option>
                <option value="TLSv1.3">TLS 1.3</option>
              </select>
            </Field>
            <label className="checkbox-field">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={t?.enabled ?? true}
              />
              <span>启用此配置</span>
            </label>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button className="button primary" disabled={busy || blocked}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : editor.type === "ca" ? (
              <ShieldCheck size={16} />
            ) : editor.type === "cert" ? (
              <KeyRound size={16} />
            ) : (
              <Check size={16} />
            )}
            {busy
              ? "正在保存…"
              : editor.type === "ca"
                ? "创建 CA"
                : editor.type === "cert"
                  ? "签发证书"
                  : "保存配置"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
