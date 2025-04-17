# Oracle Cloud Docker Deployment Guide

This guide covers how to deploy the Job Tracking application using Docker containers on Oracle Cloud Free Tier.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Local Development Setup](#local-development-setup)
- [Oracle Cloud Deployment](#oracle-cloud-deployment)
- [Maintenance and Troubleshooting](#maintenance-and-troubleshooting)
- [Security Considerations](#security-considerations)

## Overview

This application helps track job applications with LinkedIn enrichment capabilities. The system is composed of:

- **Frontend**: React-based SPA served via Nginx
- **Backend**: Node.js Express API server
- **Database**: MongoDB for data storage

The application is containerized using Docker for easy deployment and scalability.

## Architecture

The application is split into three main components, each running in its own Docker container:

1. **Frontend Container**: Nginx serving the React application
   - Handles static file serving and client-side routing
   - Proxies API requests to the backend

2. **Backend Container**: Node.js API server
   - Provides RESTful API endpoints
   - Handles business logic and data processing
   - Manages the LinkedIn enrichment service

3. **MongoDB Container**: Database
   - Stores job data, email credentials, and application state

## Local Development Setup

### Prerequisites

- Docker and Docker Compose installed
- Git
- Text editor or IDE

### Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/job-tracking.git
   cd job-tracking
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up
   ```

3. **Access the application**:
   - Frontend: http://localhost
   - Backend API: http://localhost:5000

### Docker Container Management

- **List running containers**:
  ```bash
  docker ps
  ```

- **View container logs**:
  ```bash
  docker logs <container_id>
  ```

- **Restart containers**:
  ```bash
  docker-compose restart
  ```

## Oracle Cloud Deployment

### Prerequisites

- Oracle Cloud Free Tier account
- SSH client

### Setting Up Oracle Cloud Infrastructure

1. **Create a VM instance**:
   - Sign in to your Oracle Cloud account
   - Navigate to Compute → Instances
   - Click "Create Instance"
   - Name your instance (e.g., "job-tracking-app")
   - Choose "VM.Standard.E2.1.Micro" shape (Free Tier eligible)
   - Select the latest Oracle Linux or Ubuntu image
   - Configure VCN and subnet with public IP
   - Upload or create SSH keys
   - Click "Create"

2. **Configure Network Security**:
   - Navigate to the VCN used by your instance
   - Go to Security Lists
   - Add Ingress Rules for:
     - SSH (port 22)
     - HTTP (port 80)
     - HTTPS (port 443)
     - API port (5000) if needed

### Deploying the Application

1. **Connect to your VM**:
   ```bash
   ssh opc@<your-instance-ip> -i <private-key-file>
   ```

2. **Run the setup script**:
   ```bash
   # Upload the script if needed
   scp oracle-cloud-setup.sh opc@<your-instance-ip>:~/

   # Make it executable and run
   ssh opc@<your-instance-ip> "chmod +x oracle-cloud-setup.sh && ./oracle-cloud-setup.sh"
   ```

   The setup script:
   - Updates the system
   - Installs Docker and Docker Compose
   - Clones the repository
   - Configures environment variables
   - Builds and starts the containers
   - Sets up the firewall

3. **Configure Persistent Storage**:
   ```bash
   # Create a block volume in Oracle Cloud Console
   # Attach it to your instance
   # Format and mount the volume
   sudo mkfs.ext4 /dev/sdb
   sudo mkdir -p /data/mongodb
   sudo mount /dev/sdb /data/mongodb
   echo '/dev/sdb /data/mongodb ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab

   # Update docker-compose.yml to use this mount
   sudo vi /home/opc/job-tracking/docker-compose.yml
   ```

4. **Set up SSL (Optional but recommended)**:
   ```bash
   # Install Certbot with Nginx plugin
   sudo apt install certbot python3-certbot-nginx

   # Obtain and install certificates
   sudo certbot --nginx -d yourdomain.com
   ```

### Updating the Application

To update the application with new changes:

```bash
cd ~/job-tracking
git pull
docker-compose down
docker-compose up -d --build
```

## Maintenance and Troubleshooting

### Backup and Restore

**Database Backup**:
```bash
docker exec job-tracking_mongodb_1 mongodump --out /dump
docker cp job-tracking_mongodb_1:/dump ./backup
```

**Database Restore**:
```bash
docker cp ./backup job-tracking_mongodb_1:/restore
docker exec job-tracking_mongodb_1 mongorestore /restore
```

### Monitoring

Set up monitoring with Portainer:
```bash
docker volume create portainer_data
docker run -d -p 9000:9000 --name=portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data portainer/portainer-ce
```

Access Portainer at http://your-instance-ip:9000

### Troubleshooting

**Container not starting**:
```bash
# Check container status
docker ps -a

# Check container logs
docker logs <container_id>

# Check Docker Compose logs
docker-compose logs
```

**Database connection issues**:
```bash
# Check MongoDB container status
docker ps | grep mongodb

# Check MongoDB logs
docker logs job-tracking_mongodb_1
```

**Frontend cannot connect to backend**:
Verify the Nginx configuration is correctly set up to proxy API requests.

## Security Considerations

1. **Firewall Configuration**:
   - The setup script configures UFW to allow only necessary ports
   - Review firewall rules regularly

2. **Database Security**:
   - The MongoDB container is not exposed to the public internet
   - Consider adding authentication for MongoDB

3. **HTTPS**:
   - Configure SSL certificates using Let's Encrypt
   - Redirect all HTTP traffic to HTTPS

4. **Environment Variables**:
   - Store sensitive information in environment variables
   - Never commit sensitive data to the repository

5. **Regular Updates**:
   - Keep the system and containers updated
   ```bash
   sudo apt update && sudo apt upgrade -y
   docker-compose pull
   docker-compose up -d
   ```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Oracle Cloud Documentation](https://docs.oracle.com/en-us/iaas/Content/home.htm)
- [MongoDB Documentation](https://docs.mongodb.com/)