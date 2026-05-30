#!/bin/bash
set -e
cd /home/gwisniewski/10xdevs/10xFamily

# git-clone strategy: merge .bootstrap-scaffold into cwd
# Conflict matrix: context/ dropped, .gitignore append-merged if exists, rest move silently or sideline

# 1. Merge .github (scaffold has workflows/ci.yml; cwd has skills/ and copilot-instructions.md)
mkdir -p .github/workflows
cp -r .bootstrap-scaffold/.github/workflows/* .github/workflows/

# 2. Move .gitignore (absent in cwd, so move silently)
mv .bootstrap-scaffold/.gitignore ./

# 3. Move all other top-level files/dirs (no conflicts)
for item in .bootstrap-scaffold/.env.example \
            .bootstrap-scaffold/.husky \
            .bootstrap-scaffold/.nvmrc \
            .bootstrap-scaffold/.prettierrc.json \
            .bootstrap-scaffold/.vscode \
            .bootstrap-scaffold/CLAUDE.md \
            .bootstrap-scaffold/README.md \
            .bootstrap-scaffold/astro.config.mjs \
            .bootstrap-scaffold/components.json \
            .bootstrap-scaffold/eslint.config.js \
            .bootstrap-scaffold/node_modules \
            .bootstrap-scaffold/package-lock.json \
            .bootstrap-scaffold/package.json \
            .bootstrap-scaffold/public \
            .bootstrap-scaffold/src \
            .bootstrap-scaffold/supabase \
            .bootstrap-scaffold/tsconfig.json \
            .bootstrap-scaffold/wrangler.jsonc; do
  if [ -e "$item" ]; then
    mv "$item" ./
  fi
done

# 4. Remove the now-empty scaffold directory
rm -rf .bootstrap-scaffold

echo "Merge complete. Files moved to cwd."
