"""Release guards exercised without GitHub credentials or external writes."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_tags", ROOT / "scripts/check-release-tag.py")
tags = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tags)

class ReleaseTagTest(unittest.TestCase):
    def test_valid_versions(self):
        for tag in ["v0.0.0", "v1.2.3", "v10.20.30", "v1.2.3-rc.1", "v1.2.3-alpha-beta.0"]:
            with self.subTest(tag=tag):
                self.assertTrue(tags.valid(tag))

    def test_invalid_versions(self):
        for tag in ["1.2.3", "v01.2.3", "v1.2", "v1.2.3-01", "v1.2.3-rc..1", "v1.2.3+build", "v1.2.3;echo bad", "v1.2.3\n", "../v1.2.3"]:
            with self.subTest(tag=tag):
                self.assertFalse(tags.valid(tag))

class PublishTest(unittest.TestCase):
    def publish(self, *, prerelease=False, mode="ok", missing=False, unexpected=False):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            assets = base / "assets"
            assets.mkdir()
            if not missing:
                (assets / "app.tar.gz").write_bytes(b"final archive bytes")
            if unexpected:
                (assets / "unexpected.zip").write_bytes(b"unexpected")
            fake = base / "gh"
            fake.write_text('''#!/usr/bin/env python3
import hashlib,json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['GH_CALLS'],'a') as f:f.write(json.dumps(args)+'\\n')
mode=os.environ['GH_MODE']
if args[:1]==['api']:
    if 'commits/' in args[1]:print('b'*40 if mode=='tag_changed' else 'a'*40)
    elif mode=='api_error':sys.exit(1)
    elif mode=='exists':print(os.environ['RELEASE_TAG'])
elif args[:2]==['release','view']:
    assets=[dict(name=p.name,size=p.stat().st_size,digest='sha256:'+hashlib.sha256(p.read_bytes()).hexdigest()) for p in pathlib.Path('.').iterdir()]
    if mode=='bad_manifest':assets=[]
    print(json.dumps(dict(isDraft=True,assets=assets)))
''', encoding="utf-8")
            fake.chmod(0o755)
            log = base / "calls.jsonl"
            env = os.environ | {
                "PATH": str(base) + os.pathsep + os.environ["PATH"],
                "GH_REPO": "example/stunnel-cp", "EXPECTED_SHA": "a" * 40,
                "RELEASE_TAG": "v1.2.3-rc.1" if prerelease else "v1.2.3",
                "GH_MODE": mode, "GH_CALLS": str(log),
            }
            result = subprocess.run(["bash", str(ROOT / ".github/scripts/publish-release.sh"), str(assets), "app.tar.gz"], env=env, text=True, capture_output=True)
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            checksum = (assets / "SHA256SUMS").read_text() if (assets / "SHA256SUMS").exists() else ""
            return result, calls, checksum

    def test_upload_draft_before_publish(self):
        result, calls, checksum = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        create = next(i for i, c in enumerate(calls) if c[:2] == ["release", "create"])
        view = next(i for i, c in enumerate(calls) if c[:2] == ["release", "view"])
        edit = next(i for i, c in enumerate(calls) if c[:2] == ["release", "edit"])
        self.assertLess(create, view)
        self.assertLess(view, edit)
        self.assertIn("--draft", calls[create])
        self.assertIn("--draft=false", calls[edit])
        self.assertIn("  app.tar.gz\n", checksum)

    def test_prerelease_never_marks_latest(self):
        result, calls, _ = self.publish(prerelease=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for call in calls:
            if call[:2] in (["release", "create"], ["release", "edit"]):
                self.assertIn("--prerelease", call)
                self.assertIn("--latest=false", call)

    def test_failures_do_not_publish(self):
        cases = [dict(missing=True), dict(unexpected=True), dict(mode="exists"), dict(mode="api_error"), dict(mode="tag_changed"), dict(mode="bad_manifest")]
        for case in cases:
            with self.subTest(case=case):
                result, calls, _ = self.publish(**case)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c[:2] == ["release", "edit"] for c in calls))
                if case.get("mode") != "bad_manifest":
                    self.assertFalse(any(c[:2] == ["release", "create"] for c in calls))

if __name__ == "__main__":
    unittest.main()
