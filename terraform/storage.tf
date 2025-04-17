# Storage configuration for MongoDB persistent data

# Create a block volume for MongoDB data
resource "oci_core_volume" "mongodb_volume" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = local.block_volume_name
  size_in_gbs         = var.block_volume_size_in_gbs
  vpus_per_gb         = var.block_volume_vpus_per_gb
}

# Attach the block volume to the compute instance
resource "oci_core_volume_attachment" "mongodb_volume_attachment" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.app_instance.id
  volume_id       = oci_core_volume.mongodb_volume.id
  display_name    = "${local.block_volume_name}-attachment"
}