output "instance_public_ip" {
  description = "Also available as a stable IP even across instance stop/start, since it's an Elastic IP"
  value       = aws_eip.main.public_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${aws_eip.main.public_ip}"
}

output "gateway_url" {
  value = "http://${aws_eip.main.public_ip}:8080"
}

output "web_url" {
  value = "http://${aws_eip.main.public_ip}:3000"
}

output "site_url" {
  description = "The real URL to actually use, once Caddy + DNS have settled - falls back to the plain-HTTP IP if domain_name wasn't set"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_eip.main.public_ip}:3000"
}
