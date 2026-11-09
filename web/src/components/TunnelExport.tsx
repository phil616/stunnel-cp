import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { Copy, Download, FileCode2 } from "lucide-react";
import { api, download } from "../api";
import type { Tunnel } from "../api";
import { errorMessage } from "../format";
import { Modal } from "./ui";

export type Platform = "unix" | "windows";
const platforms = [
  { label: "Unix / Linux", value: "unix" },
  { label: "Windows", value: "windows" },
];
export function TunnelExport({
  tunnel,
  preview,
  platform,
  setPlatform,
  onClose,
  ready,
  notify,
  copy,
}: {
  tunnel: Tunnel;
  preview: boolean;
  platform: Platform;
  setPlatform: (p: Platform) => void;
  onClose: () => void;
  ready: boolean;
  notify: (message: string, error?: boolean) => void;
  copy: (value: string) => Promise<void>;
}) {
  const [config, setConfig] = useState("");
  const [loadedPlatform, setLoadedPlatform] = useState<Platform | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(preview);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    setLoading(true);
    setConfig("");
    setError("");
    api<{ config: string }>(
      `/tunnels/${tunnel.id}/preview?platform=${platform}`,
    )
      .then((data) => {
        if (!cancelled) {
          setConfig(data.config);
          setLoadedPlatform(platform);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, platform, tunnel.id]);
  async function exportFile(kind: "config" | "bundle") {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await download(`/tunnels/${tunnel.id}/${kind}?platform=${platform}`);
      notify("下载已开始");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const pending = loading || loadedPlatform !== platform;
  return (
    <Modal
      title={preview ? tunnel.name : "下载部署包"}
      onClose={onClose}
      busy={busy}
      closeOnClickOutside={false}
      wide={preview}
      footer={
        <>
          {preview && (
            <Button
              variant="default"
              leftSection={<FileCode2 size={15} />}
              disabled={!ready || pending || !config || busy}
              onClick={() => void exportFile("config")}
            >
              仅配置文件
            </Button>
          )}
          <Button
            leftSection={<Download size={15} />}
            loading={busy}
            disabled={!ready || (preview && (pending || !config))}
            onClick={() => void exportFile("bundle")}
          >
            下载部署包
          </Button>
        </>
      }
    >
      <Stack>
        <SegmentedControl
          aria-label="目标平台"
          data={platforms}
          value={platform}
          onChange={(p) => setPlatform(p as Platform)}
          disabled={busy}
          fullWidth
        />
        <Text size="sm" c="dimmed">
          {platform === "windows"
            ? "Windows：使用原生控制台 tstunnel.exe，配置省略 Unix 进程选项。"
            : "Unix / Linux：前台运行；Debian / Ubuntu 使用 stunnel4。"}
        </Text>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {preview && (
          <>
            <Group justify="space-between" className="preview-toolbar">
              <Text size="sm">
                {tunnel.mode === "server" ? "服务端" : "客户端"} ·{" "}
                {tunnel.tls_min}+
              </Text>
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<Copy size={14} />}
                disabled={pending || !config}
                onClick={() => void copy(config)}
              >
                复制配置
              </Button>
            </Group>
            <pre className="config-preview" aria-busy={pending && !error}>
              {error ? (
                "配置加载失败"
              ) : pending ? (
                "加载中…"
              ) : (
                <code>{config}</code>
              )}
            </pre>
          </>
        )}
      </Stack>
    </Modal>
  );
}
