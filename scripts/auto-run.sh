#!/bin/bash
# Comprehensive automated setup and run script for Job Tracking Application
# This script handles all steps required to set up and run the application

# Color codes for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print header
echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}Job Tracking Application - Automated Setup & Run${NC}"
echo -e "${CYAN}=====================================================${NC}"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to display a step header
print_step() {
  echo -e "\n${BLUE}[STEP] $1${NC}"
}

# Function to display success message
print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

# Function to display warning message
print_warning() {
  echo -e "${YELLOW}⚠️ $1${NC}"
}

# Function to display error message
print_error() {
  echo -e "${RED}❌ $1${NC}"
}

# Function to prompt user for input with default value
prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local result

  read -p "$prompt [$default]: " result
  echo "${result:-$default}"
}

# Function to prompt for yes/no with default
prompt_yes_no() {
  local prompt="$1"
  local default="$2"
  local result

  if [[ "$default" == "Y" || "$default" == "y" ]]; then
    read -p "$prompt [Y/n]: " result
    result=${result:-Y}
  else
    read -p "$prompt [y/N]: " result
    result=${result:-N}
  fi

  if [[ "$result" =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# Function to create file with content if it doesn't exist
create_file_if_not_exists() {
  local file_path="$1"
  local content="$2"

  if [ ! -f "$file_path" ]; then
    echo "$content" > "$file_path"
    print_success "Created file: $file_path"
  else
    print_success "File already exists: $file_path"
  fi
}

# Function to get MongoDB URI from user or use default
get_mongodb_uri() {
  local default_uri="mongodb://localhost:27017/job-tracking"
  local use_docker=false
  local use_local_mongodb=false
  local mongodb_uri="$default_uri"

  if command_exists docker && command_exists docker-compose; then
    if prompt_yes_no "Would you like to use Docker for MongoDB?" "Y"; then
      use_docker=true
      use_local_mongodb=true
      # Start MongoDB container
      print_step "Starting MongoDB with Docker"

      # Navigate to backend directory which should contain docker-compose.yml
      cd backend || { print_error "Could not navigate to backend directory"; exit 1; }

      # Check if docker-compose.yml exists for MongoDB
      if [ ! -f "docker-compose.yml" ]; then
        print_warning "docker-compose.yml not found in backend directory. Creating one..."
        cat > docker-compose.yml << EOL
version: '3.8'
services:
  mongodb:
    image: mongo:6
    container_name: job-tracking-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped
    profiles:
      - local-mongodb

volumes:
  mongodb_data:
EOL
        print_success "Created docker-compose.yml file"
      fi

      # Create .env file with USE_LOCAL_MONGODB=true
      cat > .env << EOL
USE_LOCAL_MONGODB=true
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=password
MONGODB_DATABASE=job-tracking
EOL
      print_success "Created .env file with USE_LOCAL_MONGODB=true"

      # Start MongoDB container in detached mode with local-mongodb profile
      docker-compose --profile local-mongodb up -d mongodb

      # Go back to original directory
      cd ..

      print_success "MongoDB Docker container is running"
    else
      # User doesn't want to use Docker
      print_warning "Not using Docker for MongoDB"
      mongodb_uri=$(prompt_with_default "Enter your MongoDB connection URI" "$default_uri")
      use_local_mongodb=false
    fi
  else
    print_warning "Docker or docker-compose not found. Cannot start MongoDB container."
    mongodb_uri=$(prompt_with_default "Enter your MongoDB connection URI" "$default_uri")
    use_local_mongodb=false
  fi

  # Return both URI and whether using local MongoDB as an array
  echo "$mongodb_uri:$use_local_mongodb"
}

# Check prerequisite tools and versions
print_step "Checking prerequisites"

# Check for Node.js
if ! command_exists node; then
  print_error "Node.js is not installed. Please install Node.js v16 or higher."
  exit 1
fi

# Check node version
NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 16 ]; then
  print_error "Node.js version must be v16 or higher. Current version: v$NODE_VERSION"
  exit 1
fi
print_success "Node.js v$NODE_VERSION"

# Check for npm
if ! command_exists npm; then
  print_error "npm is not installed. It should come with Node.js."
  exit 1
fi

# Check npm version
NPM_VERSION=$(npm -v)
NPM_MAJOR=$(echo $NPM_VERSION | cut -d'.' -f1)
if [ "$NPM_MAJOR" -lt 8 ]; then
  print_warning "npm version should be v8 or higher for best compatibility. Current version: v$NPM_VERSION"
fi
print_success "npm v$NPM_VERSION"

# Setup environment configuration
print_step "Setting up environment configuration"

# Get MongoDB URI from user or use Docker
MONGODB_URI=$(get_mongodb_uri)

# Create backend .env file
print_step "Creating backend configuration"
BACKEND_PORT=$(prompt_with_default "Enter the port for the backend server" "5000")
NODE_ENV=$(prompt_with_default "Enter the NODE_ENV value" "development")

# Create the backend/.env file
BACKEND_ENV_CONTENT="PORT=$BACKEND_PORT
MONGODB_URI=$MONGODB_URI
NODE_ENV=$NODE_ENV"

create_file_if_not_exists "backend/.env" "$BACKEND_ENV_CONTENT"

# Create frontend .env file
print_step "Creating frontend configuration"
API_URL=$(prompt_with_default "Enter the API URL for the frontend to connect to" "http://localhost:$BACKEND_PORT/api")

# Create the frontend/.env file
FRONTEND_ENV_CONTENT="REACT_APP_API_URL=$API_URL"

create_file_if_not_exists "frontend/.env" "$FRONTEND_ENV_CONTENT"

# Install dependencies
print_step "Installing dependencies"

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend || { print_error "Could not navigate to backend directory"; exit 1; }
npm install
if [ $? -ne 0 ]; then
  print_error "Failed to install backend dependencies"
  exit 1
fi
cd ..
print_success "Backend dependencies installed"

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend || { print_error "Could not navigate to frontend directory"; exit 1; }
npm install
if [ $? -ne 0 ]; then
  print_error "Failed to install frontend dependencies"
  exit 1
fi
cd ..
print_success "Frontend dependencies installed"

# Prompt user for run mode
print_step "Select run mode"
echo "1) Traditional mode (separate backend and frontend servers)"
echo "2) Serverless mode (using Vercel)"
read -p "Select run mode [1/2] (default: 1): " RUN_MODE
RUN_MODE=${RUN_MODE:-1}

if [ "$RUN_MODE" == "1" ]; then
  print_step "Starting application in traditional mode"

  # Check for tmux to run both servers in split panes
  USE_TMUX=0
  if command_exists tmux; then
    if prompt_yes_no "Would you like to use tmux to see both servers in split panes?" "Y"; then
      USE_TMUX=1
    fi
  fi

  if [ "$USE_TMUX" -eq 1 ]; then
    print_success "Starting servers using tmux..."
    # Run in tmux
    tmux new-session \; \
      send-keys "cd $(pwd)/backend && echo 'Starting backend server...' && npm run dev" C-m \; \
      split-window -h \; \
      send-keys "cd $(pwd)/frontend && echo 'Starting frontend server...' && npm start" C-m \; \
      select-pane -t 0 \; \
      split-window -v \; \
      send-keys "echo 'Job Tracking Application is running!' && echo 'Backend API: http://localhost:$BACKEND_PORT/api' && echo 'Frontend UI: http://localhost:3000'" C-m
  else
    # Run in background
    print_success "Starting servers in background..."

    # Start backend server
    echo "Starting backend server..."
    cd backend || { print_error "Could not navigate to backend directory"; exit 1; }
    npm run dev &
    BACKEND_PID=$!
    cd ..
    print_success "Backend server started (PID: $BACKEND_PID)"

    # Start frontend server
    echo "Starting frontend server..."
    cd frontend || { print_error "Could not navigate to frontend directory"; exit 1; }
    npm start &
    FRONTEND_PID=$!
    cd ..
    print_success "Frontend server started (PID: $FRONTEND_PID)"

    # Display access information
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "${GREEN}Job Tracking Application is running!${NC}"
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "Backend API: http://localhost:$BACKEND_PORT/api"
    echo -e "Frontend UI: http://localhost:3000"
    echo -e ""
    echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
    echo -e "${CYAN}=====================================================${NC}"

    # Function to kill servers on exit
    cleanup() {
      echo ""
      echo "Shutting down servers..."
      if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        print_success "Backend server stopped"
      fi
      if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        print_success "Frontend server stopped"
      fi
      echo "Goodbye!"
      exit 0
    }

    # Set up cleanup on exit
    trap cleanup INT TERM EXIT

    # Keep the script running
    while true; do
      sleep 1
    done
  fi
else
  print_step "Starting application in serverless mode"

  # Check for Vercel CLI
  if ! command_exists vercel; then
    print_warning "Vercel CLI is not installed. Installing now..."
    npm install -g vercel
    if [ $? -ne 0 ]; then
      print_error "Failed to install Vercel CLI. Please install it manually with: npm install -g vercel"
      exit 1
    fi
  fi
  print_success "Vercel CLI is installed"

  # Create a temporary .env.local file for Vercel dev
  TEMP_ENV_CONTENT="MONGODB_URI=$MONGODB_URI
NODE_ENV=$NODE_ENV
PORT=3000"

  create_file_if_not_exists ".env.development.local" "$TEMP_ENV_CONTENT"

  # Function to clean up on exit
  cleanup() {
    echo ""
    echo "Cleaning up..."
    rm -f ".env.development.local"
    print_success "Removed temporary environment file"
    echo "Goodbye!"
    exit 0
  }

  # Set up cleanup on exit
  trap cleanup INT TERM EXIT

  # Start the Vercel development environment
  echo "Starting Vercel development environment..."
  vercel dev

  # If vercel dev exits
  echo "Vercel dev has stopped. Cleaning up..."
  cleanup
fi