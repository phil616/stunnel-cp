import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { api, certificateState, date } from "../api";
import type { Snapshot, Tunnel } from "../api";
import { errorMessage } from "../format";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { Modal } from "./ui";
import { CertificateHelp } from "./CertificateHelp";
export type Editor = { type: "ca" | "cert" | "tunnel"; tunnel?: Tunnel } | null;
type Mode = "server" | "client";
type Endpoint = {
  accept: string;
  connect: string;
  certificate_id: string;
  peer_name: string;
};
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
  const t = editor.tunnel;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const endpoint = (mode: Mode): Endpoint =>
    t?.mode === mode
      ? {
          accept: t.accept,
          connect: t.connect,
          certificate_id: t.certificate_id,
          peer_name: t.peer_name,
        }
      : {
          accept: mode === "server" ? "0.0.0.0:6380" : "127.0.0.1:16379",
          connect:
            mode === "server" ? "127.0.0.1:6379" : "redis.example.com:6380",
          certificate_id: "",
          peer_name: "",
        };
  const form = useForm({
    mode: "controlled",
    initialValues: {
      name: t?.name || "",
      description: t?.description || "",
      organization: "",
      common_name: "",
      ca_id: "",
      algorithm: "ECDSA-P256",
      days:
        editor.type === "ca"
          ? (3650 as number | string)
          : (365 as number | string),
      purpose: "server" as Mode,
      sans: "",
      mode: t?.mode || ("server" as Mode),
      endpoints: { server: endpoint("server"), client: endpoint("client") },
      tls_min: t?.tls_min || "TLSv1.2",
      enabled: t?.enabled ?? true,
    },
  });
  const guard = useUnsavedChanges(
    form.isDirty(),
    busy,
    () => submitting.current,
  );
  const mode = form.values.mode;
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
  const switchEditor = (next: "ca" | "cert" | "tunnel") =>
    guard.requestClose(() => onSwitch(next));
  async function submit(values: typeof form.values) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (editor.type === "ca")
        await api("/authorities", "POST", {
          name: values.name.trim(),
          organization: values.organization.trim(),
          algorithm: values.algorithm,
          days: Number(values.days),
        });
      else if (editor.type === "cert")
        await api("/certificates", "POST", {
          name: values.name.trim(),
          common_name: values.common_name.trim(),
          ca_id: values.ca_id,
          purpose: values.purpose,
          algorithm: values.algorithm,
          days: Number(values.days),
          sans: values.sans.split(/[\s,，]+/).filter(Boolean),
        });
      else {
        const e = values.endpoints[mode];
        await api(t ? `/tunnels/${t.id}` : "/tunnels", t ? "PUT" : "POST", {
          name: values.name.trim(),
          description: values.description.trim(),
          mode,
          accept: e.accept.trim(),
          connect: e.connect.trim(),
          certificate_id: e.certificate_id,
          peer_name: mode === "client" ? e.peer_name.trim() : "",
          tls_min: values.tls_min,
          enabled: values.enabled,
        });
      }
      form.resetDirty();
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const algorithms = (
    <NativeSelect
      label="密钥算法"
      data={["ECDSA-P256", "RSA-3072"]}
      {...form.getInputProps("algorithm")}
    />
  );
  return (
    <>
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
        onClose={() => guard.requestClose(onClose)}
        closeOnClickOutside={false}
        closeOnEscape={!guard.confirming}
        trapFocus={!guard.confirming}
        busy={busy}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <fieldset disabled={busy || guard.confirming} className="form-fields">
            <Stack gap="md">
              {editor.type === "ca" && (
                <>
                  <TextInput
                    label="CA 名称"
                    placeholder="Production Root CA"
                    required
                    maxLength={80}
                    data-autofocus
                    {...form.getInputProps("name")}
                  />
                  <TextInput
                    label="组织名称"
                    placeholder="Acme Infrastructure"
                    required
                    maxLength={120}
                    {...form.getInputProps("organization")}
                  />
                  <div className="form-grid">
                    {algorithms}
                    <NumberInput
                      label="有效期（天）"
                      required
                      min={1}
                      max={7300}
                      allowDecimal={false}
                      allowNegative={false}
                      {...form.getInputProps("days")}
                    />
                  </div>
                </>
              )}
              {editor.type === "cert" && (
                <>
                  <NativeSelect
                    label="签发 CA"
                    required
                    {...form.getInputProps("ca_id")}
                  >
                    <option value="" disabled>
                      选择证书颁发机构
                    </option>
                    {usableCAs.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {!usableCAs.length && (
                    <Alert color="yellow">
                      需要先创建有效的 CA。
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => switchEditor("ca")}
                      >
                        创建 CA
                      </Button>
                    </Alert>
                  )}
                  <div className="form-grid">
                    <TextInput
                      label="证书名称"
                      required
                      maxLength={80}
                      {...form.getInputProps("name")}
                    />
                    <TextInput
                      label="通用名称（CN）"
                      required
                      maxLength={64}
                      {...form.getInputProps("common_name")}
                    />
                  </div>
                  <div>
                    <div className="control-label" id="purpose-label">
                      证书用途
                    </div>
                    <SegmentedControl
                      fullWidth
                      aria-labelledby="purpose-label"
                      data={[
                        { label: "服务端认证", value: "server" },
                        { label: "客户端认证", value: "client" },
                      ]}
                      {...form.getInputProps("purpose")}
                    />
                  </div>
                  <Textarea
                    label={`主题备用名称（SAN）${form.values.purpose === "client" ? " · 可选" : ""}`}
                    description={
                      form.values.purpose === "server"
                        ? "服务端必填；DNS 或 IP，逗号或换行分隔。"
                        : "DNS 或 IP，逗号或换行分隔。"
                    }
                    required={form.values.purpose === "server"}
                    placeholder="redis.example.com, 10.0.0.10"
                    minRows={2}
                    maxLength={16000}
                    {...form.getInputProps("sans")}
                  />
                  <CertificateHelp context="certificate" />
                  <div className="form-grid">
                    {algorithms}
                    <NumberInput
                      label="有效期（天）"
                      description="不能超过 CA 剩余有效期。"
                      required
                      min={1}
                      max={825}
                      allowDecimal={false}
                      allowNegative={false}
                      {...form.getInputProps("days")}
                    />
                  </div>
                </>
              )}
              {editor.type === "tunnel" && (
                <>
                  <TextInput
                    label="隧道名称"
                    description="1–64 位字母、数字、_ 或 -。"
                    required
                    maxLength={64}
                    pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]*"
                    data-autofocus
                    {...form.getInputProps("name")}
                  />
                  <TextInput
                    label="描述 · 可选"
                    maxLength={500}
                    {...form.getInputProps("description")}
                  />
                  <div>
                    <div className="control-label" id="mode-label">
                      工作模式
                    </div>
                    <SegmentedControl
                      fullWidth
                      aria-labelledby="mode-label"
                      data={[
                        { label: "服务端", value: "server" },
                        { label: "客户端", value: "client" },
                      ]}
                      {...form.getInputProps("mode")}
                    />
                  </div>
                  <div className="form-grid">
                    <TextInput
                      label="监听地址（accept）"
                      required
                      {...form.getInputProps(`endpoints.${mode}.accept`)}
                    />
                    <TextInput
                      label="转发目标（connect）"
                      required
                      {...form.getInputProps(`endpoints.${mode}.connect`)}
                    />
                  </div>
                  <NativeSelect
                    label="身份认证证书"
                    required
                    {...form.getInputProps(`endpoints.${mode}.certificate_id`)}
                  >
                    <option value="" disabled>
                      选择{mode === "server" ? "服务端" : "客户端"}证书
                    </option>
                    {certificates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {date(c.not_after)} 到期
                      </option>
                    ))}
                  </NativeSelect>
                  {!certificates.length && (
                    <Alert color="yellow">
                      暂无可用的{mode === "server" ? "服务端" : "客户端"}证书。
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => switchEditor("cert")}
                      >
                        签发证书
                      </Button>
                    </Alert>
                  )}
                  {mode === "client" && (
                    <>
                      <TextInput
                        label="服务端证书身份（DNS / IP）"
                        description="填写预期服务端 SAN 中的域名或 IP，可与转发目标不同。"
                        required
                        placeholder="redis.example.com"
                        {...form.getInputProps("endpoints.client.peer_name")}
                      />
                      <CertificateHelp context="client" />
                    </>
                  )}
                  <NativeSelect
                    label="最低 TLS 版本"
                    data={[
                      { value: "TLSv1.2", label: "TLS 1.2" },
                      { value: "TLSv1.3", label: "TLS 1.3" },
                    ]}
                    {...form.getInputProps("tls_min")}
                  />
                  <Checkbox
                    label="启用此配置"
                    {...form.getInputProps("enabled", { type: "checkbox" })}
                  />
                </>
              )}
            </Stack>
          </fieldset>
          {error && (
            <Alert color="red" role="alert" mt="md">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" mt="lg">
            <Button
              variant="default"
              disabled={busy || guard.confirming}
              onClick={() => guard.requestClose(onClose)}
            >
              取消
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={busy || guard.confirming || blocked}
            >
              {editor.type === "ca"
                ? "创建 CA"
                : editor.type === "cert"
                  ? "签发证书"
                  : "保存配置"}
            </Button>
          </Group>
        </form>
      </Modal>
      {guard.confirmation}
    </>
  );
}
