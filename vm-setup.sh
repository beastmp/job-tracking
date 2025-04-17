#!/bin/bash
# Setup script for Oracle Cloud Free Tier VM with Docker containers (mono deployment)

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

# Ask user whether to use MongoDB Atlas or local MongoDB
echo "Do you want to use MongoDB Atlas (cloud) or a local MongoDB instance?"
echo "1) MongoDB Atlas"
echo "2) Local MongoDB"
read -p "Enter your choice (1 or 2): " db_choice

# Setup environment variables based on user choice
if [ "$db_choice" = "1" ]; then
    echo "You've selected MongoDB Atlas."
    read -p "Please enter your MongoDB Atlas connection string: " atlas_uri

    cat > .env << EOL
# MongoDB Atlas Configuration
MONGODB_ATLAS_URI=$atlas_uri
NODE_ENV=production
USE_LOCAL_MONGODB=false
EOL

    echo "MongoDB Atlas configuration saved."
else
    echo "You've selected Local MongoDB."
    read -p "Enter MongoDB username (default: admin): " mongo_user
    mongo_user=${mongo_user:-admin}

    read -p "Enter MongoDB password (default: password): " mongo_pass
    mongo_pass=${mongo_pass:-password}

    read -p "Enter MongoDB database name (default: job-tracking): " mongo_db
    mongo_db=${mongo_db:-job-tracking}

    cat > .env << EOL
# Local MongoDB Configuration
MONGODB_ROOT_USERNAME=$mongo_user
MONGODB_ROOT_PASSWORD=$mongo_pass
MONGODB_DATABASE=$mongo_db
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_USERNAME=$mongo_user
MONGODB_PASSWORD=$mongo_pass
NODE_ENV=production
USE_LOCAL_MONGODB=true
EOL

    echo "Local MongoDB configuration saved."
fi

# Build and start the containers using the mono deployment docker-compose file
if [ "$db_choice" = "2" ]; then
    # Start with the --profile option to enable the local-mongodb service
    sudo docker-compose -f docker-compose.mono.yml --profile local-mongodb up -d
else
    # Start without the local-mongodb service
    sudo docker-compose -f docker-compose.mono.yml up -d
fi

# Setup basic firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 5000  # For API
if [ "$db_choice" = "2" ]; then
    # Only open MongoDB port if using local MongoDB
    sudo ufw allow 27017  # For MongoDB
fi
sudo ufw enable

echo "Mono deployment setup complete!"
echo "Frontend available at: http://$(curl -s ifconfig.me)"
echo "Backend API available at: http://$(curl -s ifconfig.me):5000"
if [ "$db_choice" = "2" ]; then
    echo "MongoDB running locally and accessible at mongodb://$(curl -s ifconfig.me):27017"
fi