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
  description = "Who can SSH in from your own machine - set this to YOUR_IP/32, not left open to the world. Find your IP with: curl -s https://checkip.amazonaws.com"
  type        = string
}

variable "allow_ci_ssh" {
  description = "Opens SSH (port 22) to 0.0.0.0/0 in addition to ssh_cidr - required for the GitHub Actions deploy pipeline, since its runners have no fixed IP range to allowlist instead. Key-based auth is what actually protects the instance either way. Set to false if you'd rather only ever deploy by SSHing in yourself."
  type        = bool
  default     = true
}

variable "ssh_public_key" {
  description = "Contents of your public key file, e.g. `cat ~/.ssh/id_ed25519.pub` - generate one with `ssh-keygen -t ed25519` if you don't have one yet"
  type        = string
}

variable "domain_name" {
  description = "e.g. telefutz.com - if set, the instance configures Caddy with a real domain and gets HTTPS via Let's Encrypt automatically on boot. Leave blank to skip HTTPS setup and just serve on port 3000/8080 like the original starter did."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "If domain_name is set AND this is set (the hosted zone ID for that domain in Route 53), Terraform creates/updates the A record automatically - so a brand new instance gets DNS pointed at it without a manual console step. Leave blank to manage DNS yourself. Find it with: aws route53 list-hosted-zones"
  type        = string
  default     = ""
}
