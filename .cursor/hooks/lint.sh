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

# Only run on lintable file types
if [[ -z "$FILE" ]] || [[ ! "$FILE" =~ \.(ts|tsx|astro|js|jsx|mjs|cjs)$ ]]; then
  echo '{"additional_context": ""}'
  exit 0
fi

# Run eslint on the specific file (fail open — exit 0 even on lint errors)
OUTPUT=$(./node_modules/.bin/eslint "$FILE" 2>&1 || true)

RESULT=$(python3 -c "
import sys, json
output = sys.stdin.read().strip()
if not output:
    msg = 'Lint passed: ' + '$FILE'
else:
    msg = 'Lint results for $FILE:\n' + output
print(json.dumps({'additional_context': msg}))
" <<< "$OUTPUT")

echo "$RESULT"
exit 0
