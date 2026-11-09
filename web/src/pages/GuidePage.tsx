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
            <button
              className="text-link"
              onClick={() => setEditor({ type: "ca" })}
            >
              创建 CA
              <ArrowRight size={14} />
            </button>
          </li>
          <li>
            <div>
              <h3>签发证书</h3>
              <p>分别签发服务端和客户端证书。服务端 SAN 填写实际域名或 IP。</p>
            </div>
            <button
              className="text-link"
              onClick={() => setEditor({ type: "cert" })}
            >
              签发证书
              <ArrowRight size={14} />
            </button>
          </li>
          <li>
            <div>
              <h3>配置隧道</h3>
              <p>
                服务端转发到业务端口；客户端连接服务端 TLS 端口，并填写匹配 SAN
                的对端身份。
              </p>
            </div>
            <button
              className="text-link"
              onClick={() => setEditor({ type: "tunnel" })}
            >
              新建隧道
              <ArrowRight size={14} />
            </button>
          </li>
          <li>
            <div>
              <h3>下载并启动</h3>
              <p>
                分别导出两个部署包，在对应机器解压，进入解压目录启动。需要
                stunnel 5.x 和 OpenSSL 1.1.1+。
              </p>
            </div>
          </li>
        </ol>
        <CodeBlock
          label="启动 stunnel"
          code={
            "chmod 700 .\nchmod 600 certificates/key.pem\nstunnel stunnel.conf"
          }
          copy={copy}
        />
      </section>
      <section className="panel docs-section">
        <h2>Redis 示例</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>配置</th>
                <th>服务端</th>
                <th>客户端</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>监听地址</td>
                <td>
                  <code>0.0.0.0:6380</code>
                </td>
                <td>
                  <code>127.0.0.1:16379</code>
                </td>
              </tr>
              <tr>
                <td>转发目标</td>
                <td>
                  <code>127.0.0.1:6379</code>
                </td>
                <td>
                  <code>redis.example.com:6380</code>
                </td>
              </tr>
              <tr>
                <td>证书用途</td>
                <td>服务端</td>
                <td>客户端</td>
              </tr>
              <tr>
                <td>对端身份</td>
                <td>留空</td>
                <td>
                  <code>redis.example.com</code>
                </td>
              </tr>
            </tbody>
          </table>
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
          配置使用相对路径，运行目录必须是部署包目录。长期运行请配置系统服务的工作目录。
        </p>
        <p>
          “可部署”表示配置启用且证书有效。控制台不启动或监控 stunnel
          进程；停用配置不会停止已部署的进程。
        </p>
      </section>
    </div>
  );
}
