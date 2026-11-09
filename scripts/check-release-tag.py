#!/usr/bin/env python3
"""Validate the release tag policy: SemVer prefixed with v, without build metadata."""
import re
import sys

def valid(tag):
    match = re.fullmatch(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?", tag)
    if not match:
        return False
    return not any(part.isdigit() and len(part) > 1 and part.startswith("0") for part in (match[4] or "").split("."))

if __name__ == "__main__":
    if len(sys.argv) != 2 or not valid(sys.argv[1]):
        sys.exit("Expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-prerelease (for example v1.2.3-rc.1)")
