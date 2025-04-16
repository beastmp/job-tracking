#!/bin/bash
# Setup script for Oracle Cloud Free Tier VM

# Update system
sudo apt update
sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB (or use MongoDB Atlas)
# If using Atlas, skip this section
# wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
# sudo apt-get update
# sudo apt-get install -y mongodb-org
# sudo systemctl start mongod
# sudo systemctl enable mongod

# Clone your repository (replace with your repo URL)
git clone https://github.com/beastmp/job-tracking.git
cd job-tracking

# Install dependencies
npm run install:all

# Build frontend
cd frontend
npm run build
cd ..

# Setup PM2 for keeping the app running
sudo npm install -g pm2
pm2 start backend/server.js --name "job-tracking"
pm2 startup
pm2 save

# Setup basic firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

echo "Setup complete! Your application should be running."