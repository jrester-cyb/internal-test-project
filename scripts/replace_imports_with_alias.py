#!/usr/bin/env python3
import re
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'frontend' / 'src'

IMPORT_RE = re.compile(r"(^\s*(?:import|export)\s+[\s\S]*?from\s+)(['\"])(\.\.?/[^'\"]+)(['\"])", re.M)

exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

changed_files = []

for p in SRC.rglob('*'):
    if p.suffix.lower() not in exts:
        continue
    text = p.read_text(encoding='utf-8')
    def repl(m):
        prefix, q1, spec, q2 = m.group(1), m.group(2), m.group(3), m.group(4)
        # resolve spec relative to file
        file_dir = p.parent
        target = (file_dir / spec).resolve()
        try:
            rel = target.relative_to(SRC.resolve())
        except Exception:
            # target outside src; leave unchanged
            return m.group(0)
        # drop extension if present
        rel_path = str(rel).replace('\\', '/')
        for e in exts:
            if rel_path.endswith(e):
                rel_path = rel_path[:-len(e)]
                break
        new_spec = '@app/' + rel_path
        return prefix + q1 + new_spec + q2
    new_text = IMPORT_RE.sub(repl, text)
    if new_text != text:
        p.write_text(new_text, encoding='utf-8')
        changed_files.append(str(p.relative_to(ROOT)))

print('Modified files:', len(changed_files))
for f in changed_files:
    print(f)
