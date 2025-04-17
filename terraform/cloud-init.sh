#!/bin/bash
# cloud-init script for job-tracking application on Oracle Cloud

# Update the system and install dependencies
echo 'Updating system packages...'
sudo yum update -y
sudo yum install -y git

# Install Docker and Docker Compose
echo 'Installing Docker and Docker Compose...'
sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo yum install -y docker-compose
sudo usermod -aG docker opc

# Set up MongoDB data volume
echo 'Setting up MongoDB data volume...'
sudo mkdir -p /data/mongodb
sudo chown opc:opc /data/mongodb
# Attempt to mount the volume, it may not be available immediately
sudo mount /dev/oracleoci/oraclevdb /data/mongodb || echo 'Volume not yet available, will be mounted after reboot'
echo '/dev/oracleoci/oraclevdb /data/mongodb xfs defaults,_netdev,nofail 0 2' | sudo tee -a /etc/fstab

# Clone the repository
echo 'Cloning the job-tracking repository...'
git clone https://github.com/your-repo/job-tracking.git /home/opc/job-tracking
cd /home/opc/job-tracking

# Create environment file
echo 'Setting up environment configuration...'
cat > .env << EOF
MONGODB_URI=mongodb://localhost:27017/jobtracking
PORT=5000
EOF

# Modify Docker Compose to use the block volume for MongoDB data
echo 'Updating Docker Compose configuration...'
sed -i 's|- ./data:/data/db|- /data/mongodb:/data/db|g' docker-compose.yml

# Start the application
echo 'Starting the job-tracking application...'
docker-compose up -d

echo 'Deployment complete!'