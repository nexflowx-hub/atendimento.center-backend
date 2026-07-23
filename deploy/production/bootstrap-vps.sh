#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Execute este script como root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg git jq ufw fail2ban unzip rsync openssl python3 lsb-release apt-transport-https

# Docker Engine — repositório oficial
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  },
  "live-restore": true
}
EOF
systemctl enable --now docker
systemctl restart docker

# Utilizador operacional; o acesso root não é desativado nesta fase.
if ! id atlas >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash atlas
fi
usermod -aG sudo,docker atlas

# Firewall: somente SSH personalizado, HTTP e HTTPS.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22022/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

cat >/etc/fail2ban/jail.d/atendimento-center.conf <<'EOF'
[sshd]
enabled = true
port = 22022
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# Swap de segurança quando ainda não existe.
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/atendimento-center/{backups,logs}
cd /opt/atendimento-center

if [[ ! -d backend/.git ]]; then
  git clone https://github.com/nexflowx-hub/atendimento.center-backend.git backend
else
  git -C backend pull --ff-only
fi

if [[ ! -d frontend/.git ]]; then
  git clone https://github.com/nexflowx-hub/atendimento.center-frontend.git frontend
else
  git -C frontend pull --ff-only
fi

chown -R atlas:atlas /opt/atendimento-center
chmod +x /opt/atendimento-center/backend/deploy/production/*.sh || true

cat <<EOF

Bootstrap concluído.

Docker: $(docker --version)
Compose: $(docker compose version)

Recursos:
$(free -h)
$(df -h /)

Diretório do projeto: /opt/atendimento-center
Próximo passo: executar setup-secrets.sh no diretório backend/deploy/production.
EOF
