#!/usr/bin/env bash
# Runs the import-hang harness on the given projects one after another (default: all six).
# Results: harness-results/results.jsonl, a hang's dumps in harness-results/hangs/.
set -u
REPS=${HARNESS_REPS:-500}
PROJECTS=${*:-iphone-se iphone-15 iphone-pro-max ipad-portrait ipad-landscape desktop}
mkdir -p harness-results
for p in $PROJECTS; do
  node e2e-harness/cpu-sample.mjs > "harness-results/cpu-$p.json" & sampler=$!
  HARNESS_REPS=$REPS npx playwright test -c playwright.harness.config.ts --project="$p" > "harness-results/run-$p.log" 2>&1
  echo "$p exit $?" >> harness-results/runs.txt
  kill -TERM $sampler; wait $sampler 2>/dev/null
done
