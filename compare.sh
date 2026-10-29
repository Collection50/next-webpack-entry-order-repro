#!/usr/bin/env bash
# Usage: ./compare.sh <original|fixed> [rounds]
#
# Each round builds the app twice with `next build --webpack` and lists the
# files under .next that differ between the two builds in results/. `fixed`
# applies fix.patch to node_modules/next first, `original` reverts it.
# preview-props.json and prerender-manifest.json hold preview mode keys that
# are random on every build, so they are left out. The Server Actions
# encryption key is random on every build too, so it is pinned.
#
# Results of the App Router app (generate-app.mjs) are written with an `app-`
# prefix.
set -euo pipefail

mode=${1:?usage: ./compare.sh <original|fixed> [rounds]}
rounds=${2:-3}
[ -d app ] && prefix=app- || prefix=

export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

is_fixed() { patch -p1 -R -s -f --dry-run -d node_modules/next < fix.patch > /dev/null; }
case $mode in
  fixed) is_fixed || patch -p1 -s -d node_modules/next < fix.patch ;;
  original) ! is_fixed || patch -p1 -R -s -d node_modules/next < fix.patch ;;
  *) echo "unknown mode: $mode" >&2; exit 1 ;;
esac

module_ids() { grep -oE '[{,][0-9]+:' "$1" | tr -d '{,:' | sort -u || true; }

mkdir -p results
for ((round = 1; round <= rounds; round++)); do
  rm -rf .next build-1 build-2
  for i in 1 2; do
    npx next build --webpack > "build-$i.log" 2>&1
    mv .next "build-$i"
  done

  out="results/$prefix$mode-$round.txt"
  diff -rq build-1 build-2 -x cache -x trace -x trace-build \
    -x preview-props.json -x prerender-manifest.json > "$out" || true

  # For each page chunk whose file name changed, show the module ids it swapped.
  for a in build-1/static/chunks/pages/*.js build-1/static/chunks/app/*/page-*.js; do
    [ -e "$a" ] || continue
    stem=${a%-*}
    b=$(echo "build-2${stem#build-1}"-*.js)
    [ "$(basename "$a")" = "$(basename "$b")" ] && continue
    name=${stem#build-1/static/chunks/}
    echo "${name#pages/}: ids only in build-1: $(comm -23 <(module_ids "$a") <(module_ids "$b") | xargs)," \
      "only in build-2: $(comm -13 <(module_ids "$a") <(module_ids "$b") | xargs)" >> "$out"
  done

  echo "$prefix$mode round $round: $(grep -cE '^(Files|Only in)' "$out" || true) differing files"
done
