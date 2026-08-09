#!/usr/bin/env bash
set -uo pipefail

INPUT=$(cat)

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    path = (d.get('tool_input') or {}).get('path', '')
    print(path)
except Exception:
    print('')
" 2>/dev/null || echo "")

# Only run on TypeScript/Astro files
if [[ -z "$FILE" ]] || [[ ! "$FILE" =~ \.(ts|tsx|astro)$ ]]; then
  echo '{"additional_context": ""}'
  exit 0
fi

# Run astro check (handles .astro + .ts/.tsx) — fail open
OUTPUT=$(./node_modules/.bin/astro check 2>&1 || true)

RESULT=$(python3 -c "
import sys, json
output = sys.stdin.read().strip()
# Strip ANSI escape codes for clean output
import re
output = re.sub(r'\x1b\[[0-9;]*m', '', output)
if 'error' not in output.lower() and 'warning' not in output.lower():
    msg = 'Type check passed.'
else:
    msg = 'Type check results:\n' + output
print(json.dumps({'additional_context': msg}))
" <<< "$OUTPUT")

echo "$RESULT"
exit 0
