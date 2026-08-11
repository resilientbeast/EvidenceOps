#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  source /etc/os-release
  architecture="$(dpkg --print-architecture)"
  codename="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/ubuntu' \
    "Suites: ${codename}" \
    'Components: stable' \
    "Architectures: ${architecture}" \
    'Signed-By: /etc/apt/keyrings/docker.asc' \
    > /etc/apt/sources.list.d/docker.sources

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker-compose-plugin
fi

systemctl enable --now docker

target_user="${SUDO_USER:-}"
if [[ -n "${target_user}" && "${target_user}" != "root" ]]; then
  usermod -aG docker "${target_user}"
  echo "Added ${target_user} to the docker group; reconnect before running Docker without sudo."
fi

docker --version
docker compose version
