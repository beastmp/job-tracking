# Job Tracking Application - Terraform Deployment

This directory contains Terraform configurations for deploying the Job Tracking application to Oracle Cloud Infrastructure (OCI). The configurations support both mono and split deployment strategies with options for using either MongoDB Atlas or a local MongoDB instance.

## Deployment Options

### 1. Mono Deployment

Mono deployment deploys both frontend and backend on a single Virtual Machine, suitable for simpler setups or development environments.

### 2. Split Deployment

Split deployment creates separate VMs for frontend and backend, providing better isolation and scalability for production environments.

## Database Options

### 1. MongoDB Atlas

Connect to MongoDB Atlas cloud database service. This is recommended for production environments as it provides:
- Fully managed database service
- Automatic backups
- Scaling capabilities
- No need to manage database infrastructure

### 2. Local MongoDB

Deploy a MongoDB instance within the Docker container environment. This is suitable for:
- Development/testing environments
- When you need full control over your database
- When data must be kept within your infrastructure
- Cost-sensitive deployments

## Usage

### Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) installed (v1.0.0+)
2. Oracle Cloud Infrastructure (OCI) account
3. OCI API keys and configuration

### Configuration

Create a `terraform.tfvars` file with your OCI credentials and configuration:

```hcl
# OCI Authentication
tenancy_ocid         = "ocid1.tenancy.oc1.."
user_ocid            = "ocid1.user.oc1.."
fingerprint          = "xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx"
private_key_path     = "~/.oci/oci_api_key.pem"
region               = "us-ashburn-1"
compartment_ocid     = "ocid1.compartment.oc1.."

# SSH Configuration
ssh_public_key       = "ssh-rsa AAAA..."
ssh_private_key_path = "~/.ssh/id_rsa"

# Deployment Options
deployment_type      = "mono"  # Options: "mono" or "split"
use_local_mongodb    = false   # Set to true to use local MongoDB, false for MongoDB Atlas

# MongoDB Configuration
# For Atlas (when use_local_mongodb = false)
mongodb_atlas_uri    = "mongodb+srv://username:password@cluster.mongodb.net/job-tracking"

# For Local MongoDB (when use_local_mongodb = true)
mongodb_username     = "admin"
mongodb_password     = "password"
mongodb_database     = "job-tracking"
```

### Deployment Commands

1. Initialize Terraform:
```bash
terraform init
```

2. Plan the deployment:
```bash
terraform plan
```

3. Apply the configuration:
```bash
terraform apply
```

4. To destroy the infrastructure:
```bash
terraform destroy
```

## Outputs

After successful deployment, Terraform will output:

- URL for accessing the application
- API URL
- MongoDB connection information (if using local MongoDB)
- Public IP addresses of the instances

## File Structure

- `main.tf` - Provider configuration and common resources
- `variables.tf` - Input variable definitions
- `mono.tf` - Resources for mono deployment
- `split.tf` - Resources for split deployment
- `vcn.tf` - Network configuration
- `storage.tf` - Storage resources
- `cloud-init.sh` - Instance initialization script