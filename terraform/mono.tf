# Terraform configuration for mono deployment
# This file is used when deployment_type = "mono"

# Create a compute instance for mono deployment (frontend and backend together)
resource "oci_core_instance" "mono_instance" {
  count               = var.deployment_type == "mono" ? 1 : 0
  availability_domain = var.availability_domain_name != null ? var.availability_domain_name : data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "${var.app_name}-mono-instance"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public_subnet.id
    display_name     = "${var.app_name}-mono-vnic"
    assign_public_ip = true
    hostname_label   = "${var.app_name}mono"
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.oracle_linux.images[0].id
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = filebase64("${path.module}/cloud-init.sh")
  }

  connection {
    type        = "ssh"
    host        = self.public_ip
    user        = "opc"
    private_key = file(var.ssh_private_key_path)
  }

  # Install Docker, Git, and other dependencies for mono deployment
  provisioner "remote-exec" {
    inline = [
      "echo 'Installing dependencies...'",
      "sudo yum update -y",
      "sudo yum install -y git",
      "sudo yum install -y docker",
      "sudo systemctl enable docker",
      "sudo systemctl start docker",
      "sudo yum install -y curl",

      # Install Docker Compose
      "sudo curl -L \"https://github.com/docker/compose/releases/download/v2.15.1/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose",
      "sudo chmod +x /usr/local/bin/docker-compose",
      "sudo usermod -aG docker opc",

      # Clone the repository
      "echo 'Cloning the repository...'",
      "git clone https://github.com/yourusername/job-tracking.git /home/opc/job-tracking",
      "cd /home/opc/job-tracking",

      # Setup environment file based on MongoDB choice
      "echo 'Setting up environment...'",
      var.use_local_mongodb ? "echo 'Using local MongoDB...'" : "echo 'Using MongoDB Atlas...'",
      var.use_local_mongodb ? "echo 'USE_LOCAL_MONGODB=true' > .env" : "echo 'USE_LOCAL_MONGODB=false' > .env",

      # Add MongoDB configuration
      var.use_local_mongodb ? "echo 'MONGODB_ROOT_USERNAME=${var.mongodb_username}' >> .env" : "echo 'MONGODB_ATLAS_URI=${var.mongodb_atlas_uri}' >> .env",
      var.use_local_mongodb ? "echo 'MONGODB_ROOT_PASSWORD=${var.mongodb_password}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_DATABASE=${var.mongodb_database}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_HOST=mongodb' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_PORT=27017' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_USERNAME=${var.mongodb_username}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_PASSWORD=${var.mongodb_password}' >> .env" : "",
      "echo 'NODE_ENV=production' >> .env",
      "echo 'PORT=${var.api_port}' >> .env",

      # Start the application using mono docker-compose file with appropriate profile
      "echo 'Starting the application...'",
      var.use_local_mongodb ? "docker-compose -f docker-compose.mono.yml --profile local-mongodb up -d" : "docker-compose -f docker-compose.mono.yml up -d",

      # Setup firewall
      "sudo firewall-cmd --permanent --add-port=80/tcp",
      "sudo firewall-cmd --permanent --add-port=443/tcp",
      "sudo firewall-cmd --permanent --add-port=${var.api_port}/tcp",
      var.use_local_mongodb ? "sudo firewall-cmd --permanent --add-port=27017/tcp" : "",
      "sudo firewall-cmd --reload"
    ]
  }
}

# Mono deployment outputs
output "mono_instance_public_ip" {
  description = "Public IP address of the mono deployment instance"
  value       = var.deployment_type == "mono" ? oci_core_instance.mono_instance[0].public_ip : "Not using mono deployment"
}

output "mono_application_url" {
  description = "URL to access the job tracking application (mono deployment)"
  value       = var.deployment_type == "mono" ? "http://${oci_core_instance.mono_instance[0].public_ip}" : "Not using mono deployment"
}

output "mono_api_url" {
  description = "URL to access the job tracking API (mono deployment)"
  value       = var.deployment_type == "mono" ? "http://${oci_core_instance.mono_instance[0].public_ip}:${var.api_port}" : "Not using mono deployment"
}

output "mono_mongodb_info" {
  description = "MongoDB connection information (mono deployment)"
  value       = var.deployment_type == "mono" ? (var.use_local_mongodb ? "Local MongoDB at mongodb://${oci_core_instance.mono_instance[0].public_ip}:27017" : "Using MongoDB Atlas") : "Not using mono deployment"
}