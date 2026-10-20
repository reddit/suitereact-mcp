#!/usr/bin/env bash
# Link the portable skill set into one agent discovery directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILLS_ROOT="${SCRIPT_DIR}/.agents/skills"
TARGET_BASE="${HOME}/.agents/skills"
migrate_legacy=true

usage() {
  echo "Usage: bash link-skills.sh [--target-dir <directory>]"
  echo "Default: ~/.agents/skills (shared by compatible agents)."
  echo "Example for Claude Code: --target-dir ~/.claude/skills"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-dir)
      if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
        usage >&2
        exit 2
      fi
      TARGET_BASE="$2"
      migrate_legacy=false
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

skills=()
for dir in "${SKILLS_ROOT}"/*/; do
  if [[ -f "${dir}SKILL.md" ]]; then
    skills+=("${dir%/}")
  fi
done

if [[ ${#skills[@]} -eq 0 ]]; then
  echo "No skill directories (with SKILL.md) found in ${SKILLS_ROOT}" >&2
  exit 1
fi

# Resolve existing directories (including symlinks) and normalize missing path
# components without creating them. Pass this result to mkdir so discarded dot
# segments cannot create intermediate directories inside the source tree.
resolve_target() {
  local remaining="$1" current component candidate
  current="$(pwd -P)"
  [[ "$remaining" != /* ]] || current="/"
  while [[ -n "$remaining" ]]; do
    component="${remaining%%/*}"
    if [[ "$remaining" == */* ]]; then
      remaining="${remaining#*/}"
    else
      remaining=""
    fi
    case "$component" in
      ""|.) continue ;;
      ..) current="${current%/*}"; current="${current:-/}" ;;
      *)
        candidate="${current%/}/$component"
        if [[ -d "$candidate" ]]; then
          current="$(cd "$candidate" && pwd -P)" || return
        elif [[ -e "$candidate" || -L "$candidate" ]]; then
          echo "Target path is not a directory: $candidate" >&2
          return 2
        else
          current="$candidate"
        fi
        ;;
    esac
  done
  printf '%s\n' "$current"
}

TARGET_BASE="$(resolve_target "$TARGET_BASE")"
case "$TARGET_BASE/" in
  "$SKILLS_ROOT/"*)
    echo "Target must be outside the source skill directory: $SKILLS_ROOT" >&2
    exit 2
    ;;
esac
mkdir -p "$TARGET_BASE"

# Only replace links created by this checkout, including its old source path.
owned_link() {
  [[ -L "$1" ]] || return 1
  local target
  target="$(readlink "$1")"
  [[ "$target" == "$SKILLS_ROOT/$2" || "$target" == "$SCRIPT_DIR/.cursor/skills/$2" ]]
}

linked=0
conflicts=0
for src in "${skills[@]}"; do
  name="${src##*/}"
  dst="$TARGET_BASE/$name"
  if owned_link "$dst" "$name"; then
    ln -sfn "$src" "$dst"
  elif [[ -e "$dst" || -L "$dst" ]]; then
    echo "Preserved existing installation: $dst (move it aside or refresh it with its installer)." >&2
    conflicts=$((conflicts + 1))
    continue
  else
    ln -s "$src" "$dst"
  fi
  linked=$((linked + 1))
  echo "Linked: $dst -> $src"

  # Earlier versions installed these same skills into three overlapping roots.
  # Remove only this checkout's legacy links after the universal link exists.
  if [[ "$migrate_legacy" == true ]]; then
    for legacy_base in "$HOME/.cursor/skills" "$HOME/.codex/skills"; do
      [[ -d "$legacy_base" ]] || continue
      legacy_base="$(cd "$legacy_base" && pwd -P)"
      [[ "$legacy_base" == "$TARGET_BASE" ]] && continue
      legacy="$legacy_base/$name"
      if owned_link "$legacy" "$name"; then
        unlink "$legacy"
        echo "Removed redundant link: $legacy"
      elif [[ -e "$legacy" || -L "$legacy" ]]; then
        echo "Preserved additional installation: $legacy (may shadow or duplicate this skill)." >&2
        conflicts=$((conflicts + 1))
      fi
    done
  fi
done

echo "Linked $linked of ${#skills[@]} skills under $TARGET_BASE."
echo "Links follow this checkout; keep it available and update it before starting a new session."
echo "For client-specific registration or copied installations, see docs/setup.md#install-or-refresh-agent-skills."
if [[ $conflicts -gt 0 ]]; then
  echo "$conflicts existing installation(s) need attention; no copied or unrelated skills were replaced." >&2
  exit 1
fi
