import { Button, Table } from "@mantine/core";
import { ArrowRight } from "lucide-react";
import type { Editor } from "../components/EditorModal";
import { CodeBlock } from "../components/CodeBlock";
export function GuidePage({
  setEditor,
  copy,
}: {
  setEditor: (editor: Editor) => void;
  copy: (value: string) => Promise<void>;
}) {
  return (
    <div className="docs-page">
      <section className="panel docs-section">
        <h2>部署步骤</h2>
        <ol className="docs-steps">
          <li>
            <div>
              <h3>创建 CA</h3>
              <p>连接两端使用同一 CA 签发的证书。</p>
            </div>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setEditor({ type: "ca" })}
            >
              创建 CA
              <ArrowRight size={14} />
            </Button>
          </li>
          <li>
            <div>
              <h3>签发证书</h3>
              <p>分别签发服务端和客户端证书。服务端 SAN 填写实际域名或 IP。</p>
            </div>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setEditor({ type: "cert" })}
            >
              签发证书
              <ArrowRight size={14} />
            </Button>
          </li>
          <li>
            <div>
              <h3>配置隧道</h3>
              <p>
                服务端转发到业务端口；客户端连接服务端 TLS 端口，并填写匹配 SAN
                的对端身份。
              </p>
            </div>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setEditor({ type: "tunnel" })}
            >
              新建隧道
              <ArrowRight size={14} />
            </Button>
          </li>
          <li>
            <div>
              <h3>下载并启动</h3>
              <p>
                分别选择 Windows 或 Unix / Linux
                导出部署包，在对应机器解压，进入解压目录启动。需要 stunnel 5.x
                和 OpenSSL 1.1.1+。
              </p>
            </div>
          </li>
        </ol>
        <CodeBlock
          label="Debian / Ubuntu（路径为示例）"
          code={
            "sudo apt-get update\nsudo apt-get install -y stunnel4\ncd /opt/redis-server\nchmod 700 .\nchmod 600 certificates/key.pem\nstunnel4 ./stunnel.conf"
          }
          copy={copy}
        />
        <p>
          其他 Unix / macOS 使用各自包管理器安装，并用{" "}
          <code>command -v stunnel4</code> 或 <code>command -v stunnel</code>{" "}
          确认命令名称。
        </p>
        <CodeBlock
          label="Windows PowerShell（路径为示例）"
          code={
            "Set-Location 'C:\\Services\\redis-server'\n.\\tstunnel.exe .\\stunnel.conf"
          }
          copy={copy}
        />
        <p>
          从{" "}
          <a
            href="https://www.stunnel.org/downloads.html"
            target="_blank"
            rel="noreferrer"
          >
            stunnel 官方 Windows 安装器
          </a>{" "}
          选择可选的 <code>tstunnel.exe</code> Console CLI 组件，将 bin
          目录中的该程序及同版本所需 OpenSSL / 运行时 DLL
          放到解压目录。直接前台运行，无需 GUI 或注册服务，用 Ctrl+C 或针对 PID
          停止。限制其他账户读取私钥。
        </p>
        <p>
          Windows stunnel 会切换到 EXE 目录（或其中的 config
          子目录）。程序和匹配 DLL 必须按上述方式放在部署包根目录，且不要另建
          config 子目录；仅切换 PowerShell 目录后调用安装目录里的
          EXE，可能读到错误配置。
        </p>
        <p>
          平台仅影响本次导出，不保存到隧道。Windows 配置省略 Unix 的
          foreground、pid 选项；两种平台的证书校验相同。包内 README
          提供完整启动说明，程序和 DLL 需另行安装。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>Redis 示例</h2>
        <div className="table-scroll">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>配置</Table.Th>
                <Table.Th>服务端</Table.Th>
                <Table.Th>客户端</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>监听地址</Table.Td>
                <Table.Td>
                  <code>0.0.0.0:6380</code>
                </Table.Td>
                <Table.Td>
                  <code>127.0.0.1:16379</code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>转发目标</Table.Td>
                <Table.Td>
                  <code>127.0.0.1:6379</code>
                </Table.Td>
                <Table.Td>
                  <code>redis.example.com:6380</code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>证书用途</Table.Td>
                <Table.Td>服务端</Table.Td>
                <Table.Td>客户端</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>对端身份</Table.Td>
                <Table.Td>留空</Table.Td>
                <Table.Td>
                  <code>redis.example.com</code>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </div>
        <p>
          服务端证书 SAN 填写 <code>redis.example.com</code>。业务客户端连接本机{" "}
          <code>127.0.0.1:16379</code>。
        </p>
      </section>
      <section className="panel docs-section">
        <h2>部署包与状态</h2>
        <CodeBlock
          label="部署包"
          code={
            "stunnel.conf\ncertificates/cert.pem\ncertificates/key.pem\ncertificates/ca.pem\ncertificates/ca.crl\nREADME.md"
          }
          copy={copy}
        />
        <p>
          配置使用相对路径，运行目录必须是部署包目录。可直接前台运行；若使用进程管理器，请设置正确的工作目录。
        </p>
        <p>
          “可部署”表示配置启用且证书有效。控制台不启动或监控 stunnel
          进程；停用配置不会停止已部署的进程。
        </p>
      </section>
    </div>
  );
}
