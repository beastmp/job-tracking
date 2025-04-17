#!/bin/bash
# Setup script for Frontend VM on Oracle Cloud Free Tier

# Update system
sudo apt update
sudo apt upgrade -y

# Install Docker and Docker Compose
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.15.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add current user to docker group to avoid using sudo with docker
sudo usermod -aG docker ${USER}
echo "⚠️ NOTE: You'll need to log out and back in for docker group changes to take effect"

# Clone your repository (replace with your repo URL)
git clone https://github.com/yourusername/job-tracking.git
cd job-tracking

# Get Backend VM IP address and port
read -p "Enter Backend VM's public IP address: " backend_vm_ip
read -p "Enter Backend API port (default: 5001): " backend_port
backend_port=${backend_port:-5001}

# Create environment file with backend connection information
cat > .env << EOL
# Backend connection information
BACKEND_VM_IP=$backend_vm_ip
BACKEND_API_PORT=$backend_port
EOL

# Build and start the frontend containers
docker-compose -f ./frontend/docker-compose.yml up -d

# Setup basic firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

echo "Frontend VM setup complete!"
echo "Frontend available at: http://$(curl -s ifconfig.me)"
echo "Connected to backend API at: http://$backend_vm_ip:$backend_port"