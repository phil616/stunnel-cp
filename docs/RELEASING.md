# 自动构建与发版

## 普通构建

提交到任意分支、创建 PR、进入合并队列或手动执行 CI，都会运行：

1. 从锁文件安装依赖，构建前端。
2. Go 格式检查、`go vet`、`go test -race`、发布脚本测试。
3. 真实 stunnel mTLS 转发、认证失败与 CRL 吊销测试。
4. Playwright 完整流程与桌面 / 手机布局检查。
5. 构建 Linux、macOS、Windows 的 amd64 / arm64 共六个压缩包。

CI 的 `binary-<os>-<arch>` artifacts 保留 7 天，版本为 `snapshot-<commit>`。`frontend-dist` 是构建中间产物。浏览器测试失败时额外保存诊断文件。

## 标签自动发版

先将项目和 `.github/` 提交到 GitHub 仓库，然后为要发布的提交创建标签：

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

预发布示例：

```bash
git tag -a v1.3.0-rc.1 -m "Release v1.3.0-rc.1"
git push origin v1.3.0-rc.1
```

版本格式为 `vMAJOR.MINOR.PATCH` 或 `vMAJOR.MINOR.PATCH-prerelease`，遵循 SemVer 的数字规则，不接受 `+build` 元数据。`v*` 触发条件仅作初筛，后续会严格校验。

Release 工作流会重新运行上述校验、构建并打包，全部成功后：

1. 验证六个压缩包完整、非空且没有意外附件。
2. 生成 `SHA256SUMS`，核对远端标签仍指向已构建的源提交。
3. 创建草稿 Release，上传所有文件并生成发布说明。
4. 核对远端附件名称、大小以及 GitHub API 提供的摘要，再发布。

正式版本设为 Latest；带 `-` 的预发布版本标记为 Prerelease，不改变 Latest。不要用旧版本标签重新发版，以免改变推荐版本。

只使用自动提供的 `GITHUB_TOKEN`，不需要额外 PAT。工作流默认只读，仅发布 job 申请 `contents: write`；仓库或组织策略必须允许该权限。没有自动创建或推送标签的工作流。

手动执行 Release 时，必须指定现有版本标签，例如 `gh workflow run release.yml --ref v1.2.3`；选择分支会被拒绝。使用 `GITHUB_TOKEN` 创建标签通常不会触发新的 push 工作流，如果以后增加自动打标签流程，应显式 dispatch 到该标签或在同一工作流内衔接发布。

## 产物

以 `v1.2.3` 为例：

```text
stunnel-cp_v1.2.3_linux_amd64.tar.gz
stunnel-cp_v1.2.3_linux_arm64.tar.gz
stunnel-cp_v1.2.3_darwin_amd64.tar.gz
stunnel-cp_v1.2.3_darwin_arm64.tar.gz
stunnel-cp_v1.2.3_windows_amd64.zip
stunnel-cp_v1.2.3_windows_arm64.zip
SHA256SUMS
```

每个压缩包包含已嵌入前端的可执行文件、`BUILD_INFO.json`、`README.md`、`docs/` 和 `.env.example`。没有数据库、主密钥、运行配置或用户证书。Go 版本取自 `go.mod`，跨平台构建使用 `CGO_ENABLED=0`。

```bash
# Linux：下载对应包及 SHA256SUMS 后，检查该文件
sha256sum --ignore-missing -c SHA256SUMS

# macOS
shasum -a 256 stunnel-cp_v1.2.3_darwin_arm64.tar.gz
# 与 SHA256SUMS 中该文件的摘要逐字比较

# 解压后查看版本、源提交和构建时间
./stunnel-cp --version
```

Windows 使用 `stunnel-cp.exe --version`，可用 PowerShell `Get-FileHash -Algorithm SHA256` 计算摘要。摘要用于检查字节一致性，本工作流没有签名、公证或构建来源证明。macOS、Windows 可执行文件由 Go 交叉编译，没有在这些目标系统上执行浏览器或进程测试。

## 失败与恢复

- 校验或构建失败：修复代码后使用新标签，或在确认标签未改变时重新执行失败任务；不要移动已发布标签。
- 同名 Release 或草稿已存在：脚本会停止，防止覆盖附件。先检查 `gh release view TAG --json isDraft,assets,url`，不要将 API 查询失败视为不存在。
- 上传过程中留下草稿：核对标签提交、附件及 SHA256SUMS 后恢复草稿，或在确认尚未发布后删除该草稿并重跑。已发布的版本不覆盖附件，使用新版本修复。
- 仓库启用不可变 Release 时，本流程仍先完整准备草稿再发布。

## 本地验证

```bash
npm ci --prefix web
npm run build --prefix web
go test -race ./...
go vet ./...
python3 -m unittest discover -s scripts -p '*_test.py'
bash -n scripts/build-release.sh .github/scripts/publish-release.sh
actionlint .github/workflows/*.yml

# 在 Git checkout 根目录为单个目标打包
bash scripts/build-release.sh v1.2.3 linux amd64
```

打包脚本需要 Bash、Go 和 Python 3，输出到 `dist/`。`BUILD_COMMIT` 和 `BUILD_DATE` 可以显式传入完整源提交和 UTC 构建时间。不要在前端重建期间运行 Go 编译，因为 `go:embed` 会读取 `web/dist`。
