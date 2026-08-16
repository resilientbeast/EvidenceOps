#!/usr/bin/env bash
set -euo pipefail

cluster_name="${1:?usage: refresh-ccloud-health.sh <cluster-name> <output-file>}"
output_file="${2:?usage: refresh-ccloud-health.sh <cluster-name> <output-file>}"
output_dir="$(dirname "${output_file}")"

install -d -m 0750 "${output_dir}"
temporary_file="$(mktemp "${output_dir}/.ccloud-cluster-health.XXXXXX")"
trap 'rm -f "${temporary_file}"' EXIT

# The only supported operation is a bounded, read-only cluster observation.
ccloud cluster info "${cluster_name}" --quiet --output json > "${temporary_file}"
chmod 0640 "${temporary_file}"
mv -f "${temporary_file}" "${output_file}"
