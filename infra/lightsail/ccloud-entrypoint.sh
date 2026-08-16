#!/bin/sh
set -eu

# ccloud updates session metadata while it runs. Copy the host-authenticated
# configuration from a read-only mount into the container's ephemeral writable
# home directory, then start the application as the unprivileged node user.
ccloud_config_dir="${HOME}/.config/cockroachdb"
mkdir -p "${ccloud_config_dir}"

if [ -d /run/ccloud-auth ]; then
  cp -R /run/ccloud-auth/. "${ccloud_config_dir}/"
fi

exec "$@"
