#!/usr/bin/env bash
set -euo pipefail

# Build CLI arguments — always use JSON for machine parsing
ARGS=(--format json --severity "${INPUT_SEVERITY}")

if [ "${INPUT_ONLINE}" = "true" ]; then
  ARGS+=(--online)
fi

if [ "${INPUT_WORKSPACE}" = "true" ]; then
  ARGS+=(--workspace)
fi

if [ -n "${INPUT_SCOPES}" ]; then
  # shellcheck disable=SC2086
  ARGS+=(--scopes ${INPUT_SCOPES})
fi

if [ -n "${INPUT_IGNORE}" ]; then
  # shellcheck disable=SC2086
  ARGS+=(--ignore ${INPUT_IGNORE})
fi

# Run the scan — capture output, allow non-zero exit (depfence exits 1-3 on findings)
set +e
RESULT=$(node "${DEPFENCE_CLI}" "${ARGS[@]}" 2>&1)
SCAN_EXIT=$?
set -e

# Handle scan errors (exit code 4 = runtime error)
if [ "${SCAN_EXIT}" -eq 4 ]; then
  echo "::error::depfence encountered an error during scanning"
  echo "${RESULT}"
  exit 1
fi

# Determine summary key based on scan mode
if [ "${INPUT_WORKSPACE}" = "true" ]; then
  SUMMARY_KEY="combinedSummary"
else
  SUMMARY_KEY="summary"
fi

# Parse finding counts from JSON output
FINDINGS=$(echo "${RESULT}" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { const j = JSON.parse(d); console.log(j.${SUMMARY_KEY}?.total ?? 0); }
    catch { console.log(0); }
  });
")
CRITICAL=$(echo "${RESULT}" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { const j = JSON.parse(d); console.log(j.${SUMMARY_KEY}?.critical ?? 0); }
    catch { console.log(0); }
  });
")
HIGH=$(echo "${RESULT}" | node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { const j = JSON.parse(d); console.log(j.${SUMMARY_KEY}?.high ?? 0); }
    catch { console.log(0); }
  });
")

# Set outputs
echo "findings=${FINDINGS}" >> "${GITHUB_OUTPUT}"
echo "critical=${CRITICAL}" >> "${GITHUB_OUTPUT}"
echo "high=${HIGH}" >> "${GITHUB_OUTPUT}"

# Store JSON result using heredoc delimiter for multiline safety
{
  echo "result-json<<DEPFENCE_EOF"
  echo "${RESULT}"
  echo "DEPFENCE_EOF"
} >> "${GITHUB_OUTPUT}"

# Print human-readable summary
echo "::group::depfence scan results"
echo "Findings: ${FINDINGS} (critical: ${CRITICAL}, high: ${HIGH})"

# Re-run with terminal format for readable output in the Actions log
DISPLAY_ARGS=(--format terminal --severity "${INPUT_SEVERITY}")
if [ "${INPUT_ONLINE}" = "true" ]; then
  DISPLAY_ARGS+=(--online)
fi
if [ "${INPUT_WORKSPACE}" = "true" ]; then
  DISPLAY_ARGS+=(--workspace)
fi
if [ -n "${INPUT_SCOPES}" ]; then
  # shellcheck disable=SC2086
  DISPLAY_ARGS+=(--scopes ${INPUT_SCOPES})
fi
if [ -n "${INPUT_IGNORE}" ]; then
  # shellcheck disable=SC2086
  DISPLAY_ARGS+=(--ignore ${INPUT_IGNORE})
fi

node "${DEPFENCE_CLI}" "${DISPLAY_ARGS[@]}" 2>&1 || true
echo "::endgroup::"

# Evaluate fail-on threshold
SHOULD_FAIL=0

case "${INPUT_FAIL_ON}" in
  critical)
    [ "${CRITICAL}" -gt 0 ] && SHOULD_FAIL=1
    ;;
  high)
    ([ "${CRITICAL}" -gt 0 ] || [ "${HIGH}" -gt 0 ]) && SHOULD_FAIL=1
    ;;
  medium)
    [ "${FINDINGS}" -gt 0 ] && SHOULD_FAIL=1
    ;;
  low)
    [ "${FINDINGS}" -gt 0 ] && SHOULD_FAIL=1
    ;;
  none)
    # Never fail regardless of findings
    ;;
  *)
    echo "::warning::Unknown fail-on value '${INPUT_FAIL_ON}', defaulting to 'high'"
    ([ "${CRITICAL}" -gt 0 ] || [ "${HIGH}" -gt 0 ]) && SHOULD_FAIL=1
    ;;
esac

if [ "${SHOULD_FAIL}" -eq 1 ]; then
  echo "::error::depfence found ${FINDINGS} finding(s) at or above '${INPUT_FAIL_ON}' severity"
  exit 1
fi

echo "depfence scan passed"
