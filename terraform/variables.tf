# Variables for Oracle Cloud Infrastructure setup

# OCI Authentication variables
variable "tenancy_ocid" {
  description = "The OCID of your tenancy"
  type        = string
}

variable "user_ocid" {
  description = "The OCID of the user calling the API"
  type        = string
}

variable "fingerprint" {
  description = "The fingerprint of the key pair being used"
  type        = string
}

variable "private_key_path" {
  description = "The path to the private key file"
  type        = string
}

variable "region" {
  description = "The OCI region where resources will be created"
  type        = string
  default     = "us-ashburn-1"
}

variable "compartment_ocid" {
  description = "The OCID of the compartment where resources will be created"
  type        = string
}

# Database variables
variable "mongodb_atlas_uri" {
  description = "MongoDB Atlas connection string"
  type        = string
  sensitive   = true
  default     = ""  # Default to empty string to handle conditionals
}

variable "use_local_mongodb" {
  description = "Whether to use a local MongoDB instance instead of MongoDB Atlas"
  type        = bool
  default     = false
}

variable "mongodb_username" {
  description = "Username for local MongoDB instance"
  type        = string
  default     = "admin"
}

variable "mongodb_password" {
  description = "Password for local MongoDB instance"
  type        = string
  default     = "password"
  sensitive   = true
}

variable "mongodb_database" {
  description = "Database name for local MongoDB instance"
  type        = string
  default     = "job-tracking"
}

# Deployment type variable
variable "deployment_type" {
  description = "Type of deployment - 'mono' for combined frontend/backend or 'split' for separate VMs"
  type        = string
  default     = "mono"
  validation {
    condition     = contains(["mono", "split"], var.deployment_type)
    error_message = "Deployment type must be either 'mono' or 'split'."
  }
}

# Application specific variables
variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "job-tracking"
}

# Compute instance variables
variable "instance_shape" {
  description = "The shape of compute instance to use (Free Tier eligible)"
  type        = string
  default     = "VM.Standard.E2.1.Micro" # Free tier eligible shape
}

variable "instance_ocpus" {
  description = "Number of OCPUs for the instance"
  type        = number
  default     = 1
}

variable "instance_memory_in_gbs" {
  description = "Amount of memory in GBs for the instance"
  type        = number
  default     = 1
}

variable "availability_domain_name" {
  description = "The availability domain name where resources will be created"
  type        = string
  default     = null # Will be determined automatically if not specified
}

# SSH variables
variable "ssh_public_key" {
  description = "The public SSH key to use for instance access"
  type        = string
}

variable "ssh_private_key_path" {
  description = "The path to the private SSH key for provisioner connections"
  type        = string
}

# Network variables
variable "vcn_cidr_block" {
  description = "CIDR block for the VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr_block" {
  description = "CIDR block for the subnet"
  type        = string
  default     = "10.0.1.0/24"
}

# Application variables
variable "app_port" {
  description = "Port that the application will run on"
  type        = number
  default     = 3000
}

variable "api_port" {
  description = "Port that the API will run on"
  type        = number
  default     = 5000
}

# Storage variables
variable "block_volume_size_in_gbs" {
  description = "Size of the block volume for MongoDB data in GBs"
  type        = number
  default     = 50
}

variable "block_volume_vpus_per_gb" {
  description = "Volume performance units per GB"
  type        = number
  default     = 10
}