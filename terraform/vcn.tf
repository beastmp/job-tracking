# VCN and network resources for Oracle Cloud Infrastructure

# Create a new Virtual Cloud Network (VCN)
resource "oci_core_vcn" "job_tracking_vcn" {
  compartment_id = var.compartment_ocid
  cidr_block     = var.vcn_cidr_block
  display_name   = local.vcn_name
  dns_label      = "jobtrackingvcn"
}

# Create an Internet Gateway
resource "oci_core_internet_gateway" "internet_gateway" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.job_tracking_vcn.id
  display_name   = "${local.vcn_name}-igw"
}

# Create a Route Table for the public subnet
resource "oci_core_route_table" "public_route_table" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.job_tracking_vcn.id
  display_name   = "${local.vcn_name}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.internet_gateway.id
  }
}

# Create Security List for the public subnet
resource "oci_core_security_list" "public_security_list" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.job_tracking_vcn.id
  display_name   = "${local.vcn_name}-public-sl"

  # Allow incoming SSH connections
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
    tcp_options {
      min = 22
      max = 22
    }
  }

  # Allow incoming HTTP connections
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
    tcp_options {
      min = 80
      max = 80
    }
  }

  # Allow incoming HTTPS connections
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
    tcp_options {
      min = 443
      max = 443
    }
  }

  # Allow incoming frontend app connections
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
    tcp_options {
      min = var.app_port
      max = var.app_port
    }
  }

  # Allow incoming API port (for backend) connections
  ingress_security_rules {
    protocol    = "6" # TCP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
    tcp_options {
      min = var.api_port
      max = var.api_port
    }
  }

  # Allow ICMP traffic for troubleshooting
  ingress_security_rules {
    protocol    = "1" # ICMP
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    stateless   = false
  }

  # Allow all outbound traffic
  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
    stateless        = false
  }
}

# Create a public subnet
resource "oci_core_subnet" "public_subnet" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.job_tracking_vcn.id
  cidr_block                 = var.subnet_cidr_block
  display_name               = "${local.vcn_name}-public-subnet"
  dns_label                  = "publicsubnet"
  route_table_id             = oci_core_route_table.public_route_table.id
  security_list_ids          = [oci_core_security_list.public_security_list.id]
  prohibit_public_ip_on_vnic = false
}