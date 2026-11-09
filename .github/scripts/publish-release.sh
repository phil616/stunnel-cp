#!/usr/bin/env bash
# Usage: bash publish-release.sh dist exact-asset-name [exact-asset-name ...]
# Needs gh, python3; GH_TOKEN/GH_REPO/RELEASE_TAG/EXPECTED_SHA set by workflow.
# New releases only. Existing drafts require explicit inspected recovery.
set -euo pipefail
: "${GH_REPO:?Set GH_REPO}"
: "${RELEASE_TAG:?Set RELEASE_TAG}"
: "${EXPECTED_SHA:?Set EXPECTED_SHA}"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 "$script_dir/../../scripts/check-release-tag.py" "$RELEASE_TAG"
[[ $# -ge 2 ]] || { echo 'Expected directory and explicit asset names' >&2; exit 1; }
asset_dir=$1
shift
cd "$asset_dir"
# Reject missing, unexpected, empty or nested assets; no wildcard-only releases.
python3 - "$@" <<'PY'
import sys, pathlib, hashlib
expected = sys.argv[1:]
if len(set(expected)) != len(expected):
    raise SystemExit('Duplicate expected asset names')
actual = sorted(p.name for p in pathlib.Path('.').iterdir())
if actual != sorted(expected):
    raise SystemExit(f'Asset set mismatch: expected={sorted(expected)}, actual={actual}')
for name in expected:
    p = pathlib.Path(name)
    if p.name != name or p.is_symlink() or not p.is_file() or p.stat().st_size == 0:
        raise SystemExit(f'Invalid or empty asset: {name}')
with open('SHA256SUMS', 'w', encoding='utf-8', newline='\n') as out:
    for name in sorted(expected):
        h = hashlib.sha256()
        with open(name, 'rb') as src:
            for chunk in iter(lambda: src.read(1024 * 1024), b''):
                h.update(chunk)
        out.write(f'{h.hexdigest()}  {name}\n')
PY
# API resolves annotated and lightweight tags to their source commit.
actual_sha=$(gh api "repos/$GH_REPO/commits/$RELEASE_TAG" --jq .sha)
[[ "$actual_sha" == "$EXPECTED_SHA" ]] || {
  echo 'Remote tag no longer matches the built commit' >&2; exit 1;
}
# A failed authenticated list aborts; it is never interpreted as "not found".
existing=$(gh api --paginate "repos/$GH_REPO/releases?per_page=100" --jq '.[].tag_name')
while IFS= read -r existing_tag; do
  if [[ "$existing_tag" == "$RELEASE_TAG" ]]; then
    echo 'Release/draft already exists: inspect and recover explicitly; do not overwrite' >&2
    exit 1
  fi
done <<< "$existing"
release_flags=(--latest)
if [[ "$RELEASE_TAG" == *-* ]]; then
  release_flags=(--prerelease --latest=false)
fi
# Upload all files while the release is still mutable. API errors stop here.
gh release create "$RELEASE_TAG" "$@" SHA256SUMS --repo "$GH_REPO" \
  --verify-tag --draft --title "$RELEASE_TAG" --generate-notes "${release_flags[@]}"
# Confirm server asset names, sizes and SHA256 (when the API supplies it).
remote_manifest=$(mktemp)
trap 'rm -f "$remote_manifest"' EXIT
gh release view "$RELEASE_TAG" --repo "$GH_REPO" --json isDraft,assets > "$remote_manifest"
python3 - "$remote_manifest" "$@" SHA256SUMS <<'PY'
import json,sys,pathlib,hashlib
r=json.load(open(sys.argv[1], encoding='utf-8'))
if not r['isDraft']:
    raise SystemExit('Expected a draft release')
assets=r['assets']
if sorted(x['name'] for x in assets) != sorted(sys.argv[2:]):
    raise SystemExit('Remote asset set mismatch; leave draft for inspection')
for a in assets:
    p=pathlib.Path(a['name'])
    if a['size'] != p.stat().st_size:
        raise SystemExit(f'Remote size mismatch: {p.name}')
    if a.get('digest'):
        h=hashlib.sha256()
        with p.open('rb') as src:
            for chunk in iter(lambda: src.read(1024*1024), b''):
                h.update(chunk)
        if a['digest'] != 'sha256:'+h.hexdigest():
            raise SystemExit(f'Remote digest mismatch: {p.name}')
PY
gh release edit "$RELEASE_TAG" --repo "$GH_REPO" --draft=false "${release_flags[@]}"
