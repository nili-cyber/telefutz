# Deliberately minimal: the account's existing default VPC (every AWS
# account has one) instead of building a custom one - no NAT gateway, no
# private subnets, no ALB. One box, running the same docker-compose.yml you
# already run locally. Trades away redundancy and auto-scaling for genuinely
# low cost; infra/aws/ (the ECS setup) is the upgrade path once this outgrows
# a single instance.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_key_pair" "main" {
  key_name   = "${var.project_name}-starter"
  public_key = var.ssh_public_key
}

resource "aws_security_group" "instance" {
  name_prefix = "${var.project_name}-starter-"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH from your own IP (set via ssh_cidr)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  dynamic "ingress" {
    for_each = var.allow_ci_ssh ? [1] : []
    content {
      # GitHub Actions runners connect from a large, constantly-rotating
      # set of IPs with no practical fixed range to allowlist - key-based
      # auth (already required; password auth is off by default on this
      # AMI) is the actual security boundary here, same as it is for the
      # ssh_cidr rule above. Set allow_ci_ssh = false to skip this and only
      # ever deploy by SSHing in yourself.
      description = "SSH from anywhere - needed for the GitHub Actions deploy pipeline"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
  ingress {
    description = "api-gateway"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "web app (npm run web / a served static build)"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP - needed for Let's Encrypt's ACME challenge if you put a reverse proxy (e.g. Caddy) in front"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS - real traffic once a reverse proxy is set up"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.project_name}-starter-sg" }
}

resource "aws_instance" "main" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.instance.id]
  key_name               = aws_key_pair.main.key_name

  root_block_device {
    volume_size = 30 # within the 30GB EBS free tier allotment
    volume_type = "gp3"
  }

  # Fully self-configuring on first boot - no manual SSH steps needed for a
  # brand new instance to be completely ready. Every line here is something
  # that previously had to be done by hand and caused a real, painful
  # troubleshooting session the first time - captured here permanently:
  #   - Docker: runs the backend containers
  #   - Permanent 2GB swap: without this, `docker compose build` on all 6
  #     services at once reliably OOM-kills mid-build on a 1GB instance
  #   - chmod o+x on the home directory: Caddy runs as its own dedicated
  #     system user, which can't traverse into /home/ubuntu by default -
  #     without this fix, Caddy serves a 403 for every request
  #   - Caddy, pre-configured: if domain_name is set, this instance gets a
  #     real Let's Encrypt certificate automatically the moment DNS points
  #     at it and Caddy starts - no certbot, no manual Caddyfile editing
  user_data = <<-EOT
    #!/bin/bash
    set -e

    # --- Docker ---
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    usermod -aG docker ubuntu

    # --- Permanent swap (survives reboots, unlike a one-off swapon) ---
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab

    # --- Let Caddy (a different system user) actually reach files under
    # /home/ubuntu once the app is deployed there ---
    chmod o+x /home/ubuntu

    # --- Caddy ---
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy

    %{ if domain_name != "" ~}
    cat > /etc/caddy/Caddyfile << 'CADDYEOF'
    ${domain_name} {
        handle /api/* {
            reverse_proxy localhost:8080
        }
        handle {
            root * /home/ubuntu/telefutz/apps/app/dist
            try_files {path} /index.html
            file_server
        }
    }
    CADDYEOF
    %{ else ~}
    cat > /etc/caddy/Caddyfile << 'CADDYEOF'
    :80 {
        handle /api/* {
            reverse_proxy localhost:8080
        }
        handle {
            root * /home/ubuntu/telefutz/apps/app/dist
            try_files {path} /index.html
            file_server
        }
    }
    CADDYEOF
    %{ endif ~}

    systemctl enable caddy
    systemctl restart caddy
  EOT

  tags = { Name = "${var.project_name}-starter" }
}

resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-starter-eip" }
}

# Only created if both domain_name and route53_zone_id are set - otherwise
# DNS stays entirely your responsibility (e.g. if your domain isn't on
# Route 53). When both are set, a brand new instance gets pointed at
# automatically on `terraform apply` - no manual console step, and no
# separate "update the A record" step when replacing an instance.
resource "aws_route53_record" "main" {
  count   = var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 60
  records = [aws_eip.main.public_ip]
}
