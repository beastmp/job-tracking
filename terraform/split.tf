# Terraform configuration for split deployment
# This file is used when deployment_type = "split"

# Create a compute instance for frontend deployment
resource "oci_core_instance" "frontend_instance" {
  count               = var.deployment_type == "split" ? 1 : 0
  availability_domain = var.availability_domain_name != null ? var.availability_domain_name : data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "${var.app_name}-frontend-instance"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public_subnet.id
    display_name     = "${var.app_name}-frontend-vnic"
    assign_public_ip = true
    hostname_label   = "${var.app_name}frontend"
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

  # Install Docker, Git, and other dependencies for frontend deployment
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

      # Setup environment file for frontend
      "echo 'Setting up environment...'",
      "echo 'BACKEND_VM_IP=${oci_core_instance.backend_instance[0].public_ip}' > .env",
      "echo 'BACKEND_API_PORT=${var.api_port}' >> .env",

      # Start the frontend application using docker-compose
      "echo 'Starting the frontend application...'",
      "cd /home/opc/job-tracking/frontend",
      "docker-compose up -d",

      # Setup firewall
      "sudo firewall-cmd --permanent --add-port=80/tcp",
      "sudo firewall-cmd --permanent --add-port=443/tcp",
      "sudo firewall-cmd --reload"
    ]
  }

  depends_on = [
    oci_core_instance.backend_instance
  ]
}

# Create a compute instance for backend deployment
resource "oci_core_instance" "backend_instance" {
  count               = var.deployment_type == "split" ? 1 : 0
  availability_domain = var.availability_domain_name != null ? var.availability_domain_name : data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "${var.app_name}-backend-instance"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public_subnet.id
    display_name     = "${var.app_name}-backend-vnic"
    assign_public_ip = true
    hostname_label   = "${var.app_name}backend"
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

  # Install Docker, Git, and other dependencies for backend deployment
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
      var.use_local_mongodb ? "echo 'MONGODB_ROOT_USERNAME=${var.mongodb_username}' >> .env" : "echo 'MONGODB_ATLAS_URI_JOB_TRACKING=${var.mongodb_atlas_uri}' >> .env",
      var.use_local_mongodb ? "echo 'MONGODB_ROOT_PASSWORD=${var.mongodb_password}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_DATABASE=${var.mongodb_database}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_HOST=mongodb' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_PORT=27017' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_USERNAME=${var.mongodb_username}' >> .env" : "",
      var.use_local_mongodb ? "echo 'MONGODB_PASSWORD=${var.mongodb_password}' >> .env" : "",

      # Add frontend information for CORS
      "echo 'FRONTEND_VM_IP=${local.frontend_ip}' >> .env",
      "echo 'NODE_ENV=production' >> .env",
      "echo 'PORT=${var.api_port}' >> .env",

      # Start the backend application using docker-compose with appropriate profile
      "echo 'Starting the backend application...'",
      "cd /home/opc/job-tracking/backend",
      var.use_local_mongodb ? "docker-compose --profile local-mongodb up -d" : "docker-compose up -d",

      # Setup firewall
      "sudo firewall-cmd --permanent --add-port=${var.api_port}/tcp",
      var.use_local_mongodb ? "sudo firewall-cmd --permanent --add-port=27017/tcp" : "",
      "sudo firewall-cmd --reload"
    ]
  }
}

# Define local variables for IP addresses
locals {
  # The frontend IP is used in backend configuration for CORS
  frontend_ip = var.deployment_type == "split" ? oci_core_instance.frontend_instance[0].public_ip : "localhost"

  # The backend IP is used in frontend configuration for API calls
  backend_ip = var.deployment_type == "split" ? oci_core_instance.backend_instance[0].public_ip : "localhost"
}

# Split deployment outputs
output "frontend_public_ip" {
  description = "Public IP address of the frontend instance"
  value       = var.deployment_type == "split" ? oci_core_instance.frontend_instance[0].public_ip : "Not using split deployment"
}

output "backend_public_ip" {
  description = "Public IP address of the backend instance"
  value       = var.deployment_type == "split" ? oci_core_instance.backend_instance[0].public_ip : "Not using split deployment"
}

output "frontend_url" {
  description = "URL to access the frontend application (split deployment)"
  value       = var.deployment_type == "split" ? "http://${oci_core_instance.frontend_instance[0].public_ip}" : "Not using split deployment"
}

output "backend_api_url" {
  description = "URL to access the backend API (split deployment)"
  value       = var.deployment_type == "split" ? "http://${oci_core_instance.backend_instance[0].public_ip}:${var.api_port}" : "Not using split deployment"
}

output "backend_mongodb_info" {
  description = "MongoDB connection information (split deployment)"
  value       = var.deployment_type == "split" ? (var.use_local_mongodb ? "Local MongoDB at mongodb://${oci_core_instance.backend_instance[0].public_ip}:27017" : "Using MongoDB Atlas") : "Not using split deployment"
}