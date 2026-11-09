# HTTP API

API 与 Web 同源，JSON 编码，错误格式为 `{"error":"中文说明","request_id":"..."}`。除公开状态、初始化、登录及健康检查外，所有接口均需要会话 Cookie。敏感响应设置 `Cache-Control: no-store`。

修改请求必须使用 `Content-Type: application/json`，并携带 `X-CSRF-Protection: 1`；无请求体的 POST / DELETE 也需要来源校验标记。浏览器 Origin 必须与目标 Host 一致。API 不允许任意 stunnel 指令。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/healthz` | 数据库连通性健康检查 |
| GET | `/api/status` | 初始化状态、认证状态与版本 |
| POST | `/api/auth/setup` | 首次创建管理员 `{username,password}` |
| POST | `/api/auth/login` | 登录 `{username,password}` |
| POST | `/api/auth/logout` | 撤销当前会话 |
| POST | `/api/account/password` | 更新密码 `{current_password,new_password}`，撤销旧会话，签发新 Cookie |
| GET | `/api/snapshot` | 资源元数据与最近 100 条审计记录 |
| POST | `/api/authorities` | 创建 CA |
| DELETE | `/api/authorities/{id}` | 删除未签发过证书的 CA |
| GET | `/api/authorities/{id}/certificate` | 下载 CA 公钥证书 PEM |
| GET | `/api/authorities/{id}/crl` | 下载最新 CRL |
| POST | `/api/certificates` | 签发证书 |
| POST | `/api/certificates/{id}/revoke` | 不可逆吊销证书 |
| GET | `/api/certificates/{id}/bundle` | 下载证书、叶私钥、CA 与 CRL 的 ZIP |
| POST | `/api/tunnels` | 创建隧道 |
| PUT | `/api/tunnels/{id}` | 完整更新隧道可编辑字段 |
| DELETE | `/api/tunnels/{id}` | 删除隧道 |
| GET | `/api/tunnels/{id}/preview` | 返回 `{"config":"..."}` |
| GET | `/api/tunnels/{id}/config` | 下载 `.conf` |
| GET | `/api/tunnels/{id}/bundle` | 下载完整部署 ZIP |

常见状态码：`400` 校验失败、`401` 未登录、`403` 请求来源校验失败、`404` 资源不存在、`409` 唯一性/引用冲突或证书无法部署、`415` Content-Type 不支持、`429` 限流、`500` 内部错误。下载同样受认证保护，导出操作写入审计记录。

## 请求示例

创建 CA：

```json
{"name":"Production Root CA","organization":"Example","algorithm":"ECDSA-P256","days":3650}
```

签发服务端证书（`ca_id` 使用创建接口返回的 ID）：

```json
{"ca_id":"<ca-id>","name":"redis-server","common_name":"redis.example.com","purpose":"server","sans":["redis.example.com","10.0.0.10"],"algorithm":"ECDSA-P256","days":365}
```

客户端证书使用 `"purpose":"client"`，SAN 可为空数组。密钥算法可选 `ECDSA-P256` 或 `RSA-3072`。

创建 / 更新客户端隧道（更新时只提交下面这些可编辑字段，不包含 `id` 或时间字段）：

```json
{
  "name":"redis-client",
  "description":"本机访问远端 Redis",
  "mode":"client",
  "accept":"127.0.0.1:16379",
  "connect":"redis.example.com:6380",
  "certificate_id":"<client-certificate-id>",
  "peer_name":"redis.example.com",
  "tls_min":"TLSv1.2",
  "enabled":true
}
```

服务端模式使用 `"mode":"server"` 和对应的服务端证书，`peer_name` 留空。IPv6 端点使用 `[::1]:端口`，`peer_name` 中的 IPv6 地址不带方括号。主机端口必须是数字 1–65535。隧道名称为 1–64 位 ASCII 字母、数字、`_` 或 `-`，首字符必须是字母或数字。
