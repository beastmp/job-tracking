# Main Terraform configuration for Oracle Cloud Docker deployment

# Define Terraform provider and version requirements
terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">=4.0.0"
    }
  }
}

# Configure the OCI Provider
provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# Data sources for Availability Domains and Images
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

# Get the latest Oracle Linux image
data "oci_core_images" "oracle_linux" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Oracle Linux"
  operating_system_version = "8"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# Main outputs that work for both deployment types
output "application_url" {
  description = "URL to access the job tracking application"
  value       = var.deployment_type == "mono" ? "http://${oci_core_instance.mono_instance[0].public_ip}" : "http://${oci_core_instance.frontend_instance[0].public_ip}"
}

output "api_url" {
  description = "URL to access the job tracking API"
  value       = var.deployment_type == "mono" ? "http://${oci_core_instance.mono_instance[0].public_ip}:${var.api_port}" : "http://${oci_core_instance.backend_instance[0].public_ip}:${var.api_port}"
}