#!/usr/bin/env bash
# Build an embedded, CGO-free executable and package it for one target.
# Usage: bash scripts/build-release.sh VERSION GOOS GOARCH [OUTPUT_DIRECTORY]
set -euo pipefail
[[ $# -ge 3 && $# -le 4 ]] || { echo 'Usage: build-release.sh VERSION GOOS GOARCH [OUTPUT_DIRECTORY]' >&2; exit 1; }
version=$1
target_os=$2
target_arch=$3
output_dir=${4:-dist}
[[ "$version" =~ ^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,100}$ ]] || { echo 'Invalid build version' >&2; exit 1; }
case "$target_os/$target_arch" in
  linux/amd64|linux/arm64|darwin/amd64|darwin/arm64|windows/amd64|windows/arm64) ;;
  *) echo 'Unsupported release target' >&2; exit 1 ;;
esac
[[ -s web/dist/index.html ]] || { echo 'Build web/dist before packaging' >&2; exit 1; }
commit=${BUILD_COMMIT:-$(git rev-parse HEAD)}
[[ "$commit" =~ ^[a-fA-F0-9]{40,64}$ ]] || { echo 'BUILD_COMMIT must be a full Git commit SHA' >&2; exit 1; }
built_at=${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
[[ "$built_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { echo 'BUILD_DATE must be a UTC timestamp' >&2; exit 1; }
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
binary=stunnel-cp
[[ "$target_os" != windows ]] || binary+=.exe
CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" go build -mod=readonly -trimpath -buildvcs=false \
  -ldflags="-s -w -X github.com/phil616/stunnel-cp/internal/buildinfo.Version=$version -X github.com/phil616/stunnel-cp/internal/buildinfo.Commit=$commit -X github.com/phil616/stunnel-cp/internal/buildinfo.Date=$built_at" \
  -o "$staging/$binary" ./cmd/stunnel-cp
cp README.md .env.example "$staging/"
mkdir "$staging/docs"
cp docs/*.md "$staging/docs/"
python3 - "$staging" "$output_dir" "$version" "$target_os" "$target_arch" "$commit" "$built_at" <<'PY'
import json,pathlib,sys,tarfile,zipfile
staging,out=map(pathlib.Path,sys.argv[1:3])
version,system,arch,commit,date=sys.argv[3:]
(staging/'BUILD_INFO.json').write_text(json.dumps(dict(version=version,os=system,arch=arch,commit=commit,built_at=date),indent=2)+'\n',encoding='utf-8')
name=f'stunnel-cp_{version}_{system}_{arch}'
files=sorted(p for p in staging.rglob('*') if p.is_file())
if system=='windows':
    archive=out/(name+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files:z.write(p,p.relative_to(staging).as_posix())
else:
    archive=out/(name+'.tar.gz')
    with tarfile.open(archive,'w:gz') as z:
        for p in files:z.add(p,arcname=p.relative_to(staging).as_posix(),recursive=False)
print(archive)
PY
