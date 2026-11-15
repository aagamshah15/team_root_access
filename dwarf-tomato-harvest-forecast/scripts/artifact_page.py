"""Copy the app into a folder ready to publish as a Claude artifact (shipping extension).

Run: python scripts/artifact_page.py [out_dir]   (default build/artifact; `make artifact`)

A Claude artifact page is wrapped in its own <!doctype html><head><body> skeleton when published, so the
page file must hold only the content: this keeps app/index.html's <title>, stylesheet and scripts and the
body's contents, and drops the document wrapper and the charset/viewport tags the skeleton provides.
Everything else (app.js, trip.js, style.css, data/) is copied as-is and published alongside.
Inside Claude the shipping assistant can use the `sample` capability; served locally it stays off.
"""
import re
import shutil
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / 'app'


def page(html: str) -> str:
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
    keep = [line for line in head.splitlines() if re.search(r'<title|rel="stylesheet"|<script|name="description"', line)]
    return '\n'.join(line.strip() for line in keep) + '\n' + body.strip() + '\n'


def main(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in ('app.js', 'trip.js', 'style.css'):
        shutil.copy(APP / name, out / name)
    shutil.copytree(APP / 'data', out / 'data')
    (out / 'index.html').write_text(page((APP / 'index.html').read_text()))
    n = sum(1 for p in out.rglob('*') if p.is_file())
    assert '<html' not in (out / 'index.html').read_text() and n < 255, n   # one publish holds at most 255 files
    print(f'artifact folder {out}: {n} files')


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else APP.parent / 'build' / 'artifact')
