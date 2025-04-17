# Local variables for use throughout the Terraform configuration

locals {
  vcn_name          = "${var.app_name}-vcn"
  instance_name     = "${var.app_name}-instance"
  block_volume_name = "${var.app_name}-mongodb-volume"

  # Get the first AD in the region
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
}