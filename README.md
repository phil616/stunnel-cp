# stunnel Control Plane

一个用 Go、React 和 SQLite 构建的 stunnel 配置与私有 PKI 管理工具。前端完整嵌入 Go 二进制，运行时不需要 Node.js、外部 CDN 或独立数据库。

支持创建私有根 CA、签发服务端与客户端证书、生成双向 TLS 配置，以及下载包含证书、私钥和吊销列表的部署包。界面为中文，适配桌面与手机。

## 快速启动

环境：Go **1.26.10+**；修改前端时需要 Node.js **24 LTS** 和 npm。

```bash
# 源码已附带编译后的 web/dist，可直接启动
go run ./cmd/stunnel-cp
```

打开 **http://127.0.0.1:8080**，按提示设置管理员用户名和密码。没有默认密码。默认只监听本机，首次启动会创建 `data/`、SQLite 数据库和 `master.key`。

```bash
# 完整构建：安装锁定的前端依赖、检查 TypeScript、编译前端并嵌入 Go
make build

# 运行单一二进制
./bin/stunnel-cp
```

二进制可以移动到其他目录运行。默认数据目录相对于启动时的工作目录；正式部署应设置绝对路径。

## 功能

- **工作台**：资源统计、近期配置、到期提醒和最近操作。
- **证书颁发机构**：多 CA、ECDSA P-256 / RSA 3072、下载 CA 公钥证书与 CRL。
- **证书管理**：分别限定 ServerAuth / ClientAuth 用途；支持 DNS、通配符 DNS 和 IPv4 / IPv6 SAN；导出证书包；不可逆吊销。
- **隧道管理**：服务端 / 客户端模式、监听和目标地址、TLS 1.2 / 1.3、对端身份校验、编辑、启停、删除和配置预览。
- **导出**：单独的 `stunnel.conf`，或完整 ZIP 部署包；私钥在 ZIP 中使用 `0600` 权限。
- **账户与审计**：首次初始化、登录、退出、修改密码和其他会话失效；资源变更与审计记录在同一数据库事务中提交，页面展示最近 100 条记录。

- **说明页面**：部署步骤、证书与 CRL、备份恢复和故障排查。
- **自动构建与发版**：分支 / PR 校验并打包；推送版本标签后自动发布六个平台的 Release 产物和 SHA-256 清单。

“启用”表示配置允许导出。“可部署”表示启用且关联证书有效。**本项目不启动、重载或监控本机或远端的 stunnel 进程。**

## 完成一次 mTLS 部署

以 Redis 为例，目标业务服务在服务端的 `127.0.0.1:6379`。

1. 创建一个 CA，例如 `Production Root CA`。
2. 在该 CA 下签发服务端证书，SAN 填写 `redis.example.com`；再签发独立的客户端证书。
3. 创建服务端隧道：

   | 字段 | 值 |
   | --- | --- |
   | 模式 | 服务端 |
   | 监听地址 | `0.0.0.0:6380` |
   | 转发目标 | `127.0.0.1:6379` |
   | 证书 | 上面的服务端证书 |

4. 创建客户端隧道：

   | 字段 | 值 |
   | --- | --- |
   | 模式 | 客户端 |
   | 监听地址 | `127.0.0.1:16379` |
   | 转发目标 | `redis.example.com:6380` |
   | 服务端证书身份 | `redis.example.com` |
   | 证书 | 上面的客户端证书 |

5. 分别下载两个隧道的部署包，放到对应机器。目标机器安装 **stunnel 5.x + OpenSSL 1.1.1+**。已使用 stunnel 5.72 / OpenSSL 3.0.13 验证配置。
6. 在各自解压后的目录执行：

   ```bash
   chmod 700 .
   chmod 600 certificates/key.pem
   stunnel stunnel.conf
   # 部分发行版的命令名是 stunnel4
   ```

7. 业务客户端访问 `127.0.0.1:16379` 即可。要长期运行，请通过系统服务管理器管理 stunnel，设置工作目录为部署目录。配置使用相对证书路径和前台运行方式。

部署包结构：

```text
stunnel.conf
certificates/
  cert.pem      # 当前隧道的身份证书
  key.pem       # 当前隧道的私钥，包含敏感信息
  ca.pem        # 信任根公钥证书
  ca.crl        # 签发时的吊销列表快照
README.md       # 启动与 CRL 更新说明
```

导出配置固定启用 `verifyChain = yes`、`requireCert = yes` 和 `CRLfile`。客户端同时配置 `checkHost` + `sni`，或 `checkIP`。客户端的对端身份必须匹配服务端证书 SAN。两端证书必须由**同一个 CA** 签发。服务器目前信任该 CA 下所有有效的客户端证书；细粒度客户端授权需在业务层实现。

配置指令依据 [stunnel 官方手册](https://www.stunnel.org/manual.html) 和[认证说明](https://www.stunnel.org/auth.html)。

## 吊销、续期与 CRL

- CRL 的有效期为 **7 天**（不超过 CA 到期时间），必须在到期前下载新 CRL，分发并重载所有节点。
- 吊销操作立即阻止控制台再次导出相关证书私钥与隧道文件。
- **已下载的部署包和正在运行的 stunnel 不会自动更新。** 吊销后，应从 CA 页面下载新的 CRL，替换各对端的 `certificates/ca.crl`，然后重载或重启 stunnel。
- 证书续期通过签发新证书、编辑隧道更换证书、重新导出部署包实现。
- 不提供 CA 私钥导出，也不硬删除已签发的证书。存在签发记录的 CA 无法删除；吊销历史会保留。
- CA 有效期 1–7300 天，叶证书 1–825 天；叶证书不能超过 CA 剩余有效期。服务端证书必须包含 SAN。

## 环境配置

程序直接读取进程环境变量，不自动加载 `.env` 文件。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STCP_ADDR` | `127.0.0.1:8080` | HTTP / HTTPS 监听地址 |
| `STCP_DATA_DIR` | `./data` | 数据目录，正式环境推荐绝对路径 |
| `STCP_MASTER_KEY` | 空 | 可选，64 位十六进制 AES-256 主密钥；设置后覆盖 `master.key` 文件来源 |
| `STCP_SECURE_COOKIE` | `false` | HTTPS 反向代理部署时设为 `true` |
| `STCP_TLS_CERT` | 空 | 控制台 HTTPS 证书 PEM 路径 |
| `STCP_TLS_KEY` | 空 | 控制台 HTTPS 私钥 PEM 路径，必须与证书同时设置 |

直接提供控制台 HTTPS 时会自动启用 Secure Cookie：

```bash
STCP_ADDR=0.0.0.0:8443 \
STCP_DATA_DIR=/var/lib/stunnel-cp \
STCP_TLS_CERT=/etc/stunnel-cp/web-cert.pem \
STCP_TLS_KEY=/etc/stunnel-cp/web-key.pem \
./bin/stunnel-cp
```

也可以将控制台放在 HTTPS 反向代理后面：后端保持本机监听，设置 `STCP_SECURE_COOKIE=true`，代理保留原始 `Host` 请求头。首次初始化应在控制台向不可信网络开放之前完成。页面位于根路径 `/`，不支持子路径代理。

## GitHub 自动发版

提交到 GitHub 后，推送版本标签即可触发构建和发布：

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

支持 Linux、macOS、Windows 的 amd64 / arm64；预发布标签如 `v1.3.0-rc.1` 会自动标记为 Prerelease。所有测试和构建通过后才发布，使用内置 `GITHUB_TOKEN`，无需 PAT。详细流程、产物名称和恢复方式见 [发版说明](docs/RELEASING.md)。

## Docker

```bash
docker compose up --build -d
```

默认仅绑定宿主机 `127.0.0.1:8080`，使用命名卷持久化数据。镜像为多阶段构建，运行阶段使用 distroless 非 root 用户、只读根文件系统及独立数据卷。

挂载已有宿主目录时，需事先确保目录归 UID/GID `65532:65532` 所有且可写。配置 HTTPS 反向代理时，将 `compose.yaml` 的 `STCP_SECURE_COOKIE` 改为 `"true"`。

## 安全与备份

- CA 和叶证书私钥采用 **AES-256-GCM** 加密；每条记录的 ID 作为关联数据，防止交换密文。主密钥为随机 32 字节。
- 数据目录默认 `0700`，数据库和主密钥文件为 `0600`。启动时校验主密钥与数据库绑定，缺失或错误时拒绝启动。
- 密码采用 bcrypt（cost 12）；会话令牌随机生成，数据库仅保存 SHA-256 摘要。Cookie 为 HttpOnly、SameSite Strict，支持 Secure，固定 12 小时到期。
- 登录与初始化按来源 IP 限流（每分钟 10 次），不信任客户端提供的 `X-Forwarded-For`。代理后多个用户会共享代理 IP 的限额。
- 修改操作要求 `X-CSRF-Protection: 1`，并校验 Origin 与 Fetch Metadata；API 不开放 CORS。
- JSON 请求限制为 16 KiB，拒绝未知字段；SQL 参数化；配置字段使用白名单和严格地址验证，不允许注入任意 stunnel 指令。
- 带请求 ID 的 JSON 日志、HTTP 超时、异常恢复、安全响应头和优雅退出。
- 单管理员、单工作空间，适合自托管配置管理；没有多租户、RBAC、HSM、ACME、外部 CA 导入或自动部署代理。

**备份**：停止控制台进程，完整备份数据目录（包括 `stunnel.db`、可能存在的 WAL 文件与 `master.key`）。如果使用环境主密钥，须在密钥管理系统中独立备份该值。恢复时必须同时恢复数据库和对应主密钥。在线复制单个 SQLite 文件不能保证一致性。部署包包含明文叶私钥，应通过安全通道传输并限制访问。

## 开发与验证

```bash
# 修改前端：另一个终端先启动 Go 后端
npm ci --prefix web
npm run dev --prefix web
# 访问 Vite 打印的地址，/api 会代理至 127.0.0.1:8080

# 更新嵌入资源后构建
npm run build --prefix web
go build -o bin/stunnel-cp ./cmd/stunnel-cp

# 单元、HTTP 集成、SQLite 持久化、加密与竞争检测
go test -race ./...
go vet ./...

# 实际 stunnel 测试（可选，测试自动使用临时目录和本机端口）
STCP_STUNNEL_BIN=/usr/bin/stunnel4 \
  go test -race ./internal/service -run TestStunnelMTLS -v

# 浏览器全流程测试：会自动启动隔离数据目录的 Go 服务
# 本机有 /usr/bin/google-chrome 时自动复用，否则先安装测试浏览器
cd web
npx playwright install chromium
npm run test:e2e
```

可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定浏览器路径。端到端测试使用 `127.0.0.1:18080`，测试结束会清理隔离的数据目录。测试覆盖初始化、CA 创建、证书签发、配置保存、预览、ZIP 下载、桌面与移动布局、吊销和重新登录。实进程测试验证双 stunnel 转发及未认证客户端、错误主机名、CRL 吊销的拒绝行为。

API 入口与调用方式见 [docs/API.md](docs/API.md)。

## 代码结构

```text
cmd/stunnel-cp/     程序入口、信号处理和生命周期
internal/
  buildinfo/       构建版本、提交与时间
  config/          环境配置
  domain/          领域模型（私钥字段不参与 JSON 序列化）
  store/           SQLite、迁移、事务、会话与审计
  secure/          主密钥管理、AES-GCM 加密
  pki/             X.509、密钥生成、签发与 CRL
  service/         校验、业务编排、配置渲染和 ZIP 导出
  httpapi/         路由、认证、安全中间件和 HTTP 处理
.github/           CI、标签发版与发布脚本
scripts/           交叉编译、打包与发版校验
web/
  src/             React / TypeScript 界面与可复用组件
  dist/            编译后的静态资源，作为 go:embed 输入
  tests/           Playwright 浏览器集成测试
  embed.go         内嵌文件系统
```

领域和业务代码不依赖 HTTP；HTTP 层不接触原始私钥。数据库负责外键与唯一性约束，业务层串行化签发、吊销与导出操作。默认 SQLite WAL 模式，单连接池控制写入竞争。前端依赖通过 `package-lock.json` 固定，Go 依赖通过 `go.mod` / `go.sum` 固定。
