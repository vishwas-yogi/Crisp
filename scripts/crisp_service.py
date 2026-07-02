#!/usr/bin/env python3
"""Called by the macOS Automator service — reads selected text from stdin,
sends it to the Crisp daemon, writes the rewritten text to stdout."""

import sys
import json
import urllib.request
import urllib.error


def main() -> None:
    text = sys.stdin.read()
    if not text.strip():
        return

    body = json.dumps({'text': text}).encode('utf-8')
    req = urllib.request.Request(
        'http://127.0.0.1:8765/rewrite',
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            sys.stdout.write(data.get('result', text))
    except (urllib.error.URLError, OSError):
        # Daemon not running — return text unchanged so the Service is a no-op
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
