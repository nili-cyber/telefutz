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
    description = "SSH - restricted to your IP via ssh_cidr"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
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

  # Installs Docker so the instance is ready the moment you SSH in - it
  # deliberately does NOT pull your code or start anything, since that'd
  # mean baking a git credential or a public-repo assumption into this
  # config. You git clone / scp the repo over yourself (see README) and run
  # docker compose up from there, same as running it locally.
  user_data = <<-EOT
    #!/bin/bash
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    usermod -aG docker ubuntu
  EOT

  tags = { Name = "${var.project_name}-starter" }
}

resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-starter-eip" }
}
