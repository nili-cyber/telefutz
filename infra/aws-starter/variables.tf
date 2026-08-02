variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "telefutz"
}

variable "instance_type" {
  description = "t3.micro (1GB RAM) is Free Tier eligible on a new AWS account's first 12 months, but running postgres + redis + all 6 services on 1GB RAM at once is genuinely tight, especially while images are building. t3.small (2GB RAM, ~$15/mo, not free) is the safer choice if you hit out-of-memory issues - start with micro since it costs nothing, and resize (see README) if containers start crash-looping."
  type        = string
  default     = "t3.micro"
}

variable "ssh_cidr" {
  description = "Who can SSH in - set this to YOUR_IP/32, not left open to the world. Find your IP with: curl -s https://checkip.amazonaws.com"
  type        = string
}

variable "ssh_public_key" {
  description = "Contents of your public key file, e.g. `cat ~/.ssh/id_ed25519.pub` - generate one with `ssh-keygen -t ed25519` if you don't have one yet"
  type        = string
}
