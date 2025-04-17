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

# Function to check if Docker is running
is_docker_running() {
  if command_exists docker; then
    if docker info >/dev/null 2>&1; then
      return 0
    else
      return 1
    fi
  else
    return 1
  fi
}

# Function to start Docker
start_docker() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_warning "Attempting to start Docker service..."
    sudo systemctl start docker
    sleep 5
    if is_docker_running; then
      print_success "Docker service started"
      return 0
    else
      print_error "Failed to start Docker service"
      return 1
    fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    print_warning "Attempting to start Docker Desktop..."
    open -a Docker
    echo "Waiting for Docker to start (this may take a minute)..."
    for i in {1..12}; do
      sleep 5
      if is_docker_running; then
        print_success "Docker started successfully"
        return 0
      fi
      echo "⏳ Still waiting for Docker to start..."
    done
    print_error "Docker failed to start in the expected time"
    return 1
  else
    print_error "Cannot automatically start Docker on this OS"
    return 1
  fi
}

# Function to check if MongoDB is installed and running
check_mongodb_local() {
  # Check if MongoDB is installed
  if command_exists mongod; then
    print_success "MongoDB is installed locally"

    # Check if MongoDB service is running
    if pgrep -x "mongod" >/dev/null; then
      print_success "MongoDB service is running"
      return 0
    else
      print_warning "MongoDB is installed but not running"
      return 1
    fi
  else
    return 2
  fi
}

# Function to attempt to start MongoDB
start_mongodb_local() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_warning "Attempting to start MongoDB service..."
    sudo systemctl start mongod 2>/dev/null || sudo service mongod start 2>/dev/null
    sleep 3
    if pgrep -x "mongod" >/dev/null; then
      print_success "MongoDB service started"
      return 0
    else
      print_error "Failed to start MongoDB service"
      return 1
    fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    print_warning "Attempting to start MongoDB service..."
    brew services start mongodb-community 2>/dev/null
    sleep 3
    if pgrep -x "mongod" >/dev/null; then
      print_success "MongoDB service started"
      return 0
    else
      print_error "Failed to start MongoDB service"
      return 1
    fi
  else
    print_error "Cannot automatically start MongoDB on this OS"
    return 1
  fi
}

# Function to install MongoDB
install_mongodb() {
  print_step "Installing MongoDB locally"

  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Ubuntu/Debian based
    if command_exists apt-get; then
      print_warning "Installing MongoDB using apt..."
      # Import MongoDB public GPG key
      wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
      # Create list file for MongoDB
      echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
      # Update package database
      sudo apt-get update
      # Install MongoDB
      sudo apt-get install -y mongodb-org
      # Start MongoDB
      sudo systemctl start mongod
      # Enable MongoDB to start on boot
      sudo systemctl enable mongod

      if pgrep -x "mongod" >/dev/null; then
        print_success "MongoDB installed and started"
        return 0
      else
        print_error "MongoDB installed but failed to start"
        return 1
      fi
    # Red Hat/Fedora based
    elif command_exists dnf; then
      print_warning "Installing MongoDB using dnf..."
      # Create repo file
      echo "[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc" | sudo tee /etc/yum.repos.d/mongodb-org-6.0.repo
      # Install MongoDB
      sudo dnf install -y mongodb-org
      # Start MongoDB
      sudo systemctl start mongod
      # Enable MongoDB to start on boot
      sudo systemctl enable mongod

      if pgrep -x "mongod" >/dev/null; then
        print_success "MongoDB installed and started"
        return 0
      else
        print_error "MongoDB installed but failed to start"
        return 1
      fi
    else
      print_error "Cannot detect package manager to install MongoDB"
      return 1
    fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command_exists brew; then
      print_warning "Installing MongoDB using Homebrew..."
      brew tap mongodb/brew
      brew install mongodb-community
      brew services start mongodb-community

      if pgrep -x "mongod" >/dev/null; then
        print_success "MongoDB installed and started"
        return 0
      else
        print_error "MongoDB installed but failed to start"
        return 1
      fi
    else
      print_error "Homebrew is required to install MongoDB on macOS"
      return 1
    fi
  else
    print_error "Cannot install MongoDB on this OS automatically"
    return 1
  fi
}

# Function to test MongoDB connection
test_mongodb_connection() {
  local connection_string="$1"

  if command_exists mongosh; then
    if echo 'db.runCommand({ping:1})' | mongosh "$connection_string" --quiet | grep -q '"ok": 1'; then
      return 0
    else
      return 1
    fi
  elif command_exists mongo; then
    if echo 'db.runCommand({ping:1})' | mongo "$connection_string" --quiet | grep -q '"ok" : 1'; then
      return 0
    else
      return 1
    fi
  else
    # Cannot test connection without mongo client
    return 2
  fi
}

# Function to get MongoDB URI from user or use Docker
get_mongodb_uri() {
  local default_uri="mongodb://localhost:27017/job-tracking"
  local default_atlas_uri="mongodb+srv://username:password@cluster0.mongodb.net/job-tracking"
  local use_docker=false
  local use_local_mongodb=false
  local mongodb_uri="$default_uri"
  local mongodb_local_status
  local docker_available=false
  local docker_running=false
  local auto_decide=false

  # Check if MongoDB is installed and running locally
  check_mongodb_local
  mongodb_local_status=$?

  # Check if Docker is available and running
  if command_exists docker && command_exists docker-compose; then
    docker_available=true
    if is_docker_running; then
      print_success "Docker is running"
      docker_running=true
    else
      print_warning "Docker is installed but not running"
    fi
  else
    print_warning "Docker is not available on this system"
  fi

  # Ask if user wants automatic selection
  if prompt_yes_no "Do you want the script to automatically choose the best MongoDB option?" "Y"; then
    auto_decide=true

    # Automatic decision logic
    if [ "$mongodb_local_status" -eq 0 ]; then
      # MongoDB is installed and running
      print_warning "Automatically selecting local MongoDB instance"
      mongodb_uri="$default_uri"
      use_local_mongodb=true

      # Test connection
      if test_mongodb_connection "$mongodb_uri"; then
        print_success "Successfully connected to local MongoDB"
      else
        print_warning "Local MongoDB connection test failed, but proceeding anyway"
      fi
    elif [ "$docker_available" = true ] && [ "$docker_running" = true ]; then
      # Use Docker
      use_docker=true
      use_local_mongodb=true
      print_warning "Automatically selecting Docker for MongoDB"
      setup_mongodb_docker
    elif [ "$mongodb_local_status" -eq 1 ]; then
      # MongoDB installed but not running, try to start it
      print_warning "Found MongoDB installation that's not running. Attempting to start..."
      if start_mongodb_local; then
        mongodb_uri="$default_uri"
        use_local_mongodb=true
      else
        # Try Docker as fallback if available but not running
        if [ "$docker_available" = true ] && [ "$docker_running" = false ]; then
          print_warning "Attempting to start Docker..."
          if start_docker; then
            use_docker=true
            use_local_mongodb=true
            setup_mongodb_docker
          else
            # Use Atlas as last resort
            print_warning "Falling back to MongoDB Atlas"
            mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
            use_local_mongodb=false
          fi
        else
          # Use Atlas
          print_warning "Falling back to MongoDB Atlas"
          mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
          use_local_mongodb=false
        fi
      fi
    else
      # No MongoDB, try to install it
      print_warning "No local MongoDB found. Attempting to install automatically..."
      if install_mongodb; then
        mongodb_uri="$default_uri"
        use_local_mongodb=true
      else
        # Try Docker as fallback
        if [ "$docker_available" = true ]; then
          if [ "$docker_running" = false ]; then
            print_warning "Attempting to start Docker..."
            start_docker
          fi

          if is_docker_running; then
            use_docker=true
            use_local_mongodb=true
            setup_mongodb_docker
          else
            # Use Atlas as last resort
            print_warning "Falling back to MongoDB Atlas"
            mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
            use_docker=false
            use_local_mongodb=false
          fi
        else
          # Use Atlas
          print_warning "Falling back to MongoDB Atlas"
          mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
          use_local_mongodb=false
        fi
      fi
    fi
  else
    # Manual selection
    echo -e "\n${YELLOW}MongoDB Connection Options:${NC}"
    echo "1) Use MongoDB Atlas (cloud-hosted)"
    echo "2) Use MongoDB locally with Docker"
    echo "3) Use existing local MongoDB instance"
    echo "4) Install MongoDB locally (automatic)"

    read -p "Choose MongoDB connection option [1-4] (default: 2): " mongo_choice
    mongo_choice=${mongo_choice:-2}

    case $mongo_choice in
      1)
        # MongoDB Atlas option
        print_warning "Using MongoDB Atlas (cloud-hosted)"
        mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
        use_local_mongodb=false
        ;;
      2)
        # Docker option
        print_warning "Using local MongoDB via Docker"

        if [ "$docker_available" = false ]; then
          print_error "Docker is not installed"
          print_warning "Falling back to MongoDB Atlas"
          mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
          use_local_mongodb=false
        else
          if [ "$docker_running" = false ]; then
            print_error "Docker is installed but not running"
            if prompt_yes_no "Would you like to try starting Docker now?" "Y"; then
              if start_docker; then
                docker_running=true
              else
                print_warning "Falling back to MongoDB Atlas"
                mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
                use_local_mongodb=false
                break
              fi
            else
              print_warning "Falling back to MongoDB Atlas"
              mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
              use_local_mongodb=false
              break
            fi
          fi

          if [ "$docker_running" = true ]; then
            use_docker=true
            use_local_mongodb=true
            setup_mongodb_docker
          fi
        fi
        ;;
      3)
        # Local MongoDB instance option
        print_warning "Using existing local MongoDB instance"
        if [ "$mongodb_local_status" -eq 0 ]; then
          print_success "Local MongoDB is running"
        elif [ "$mongodb_local_status" -eq 1 ]; then
          print_warning "Local MongoDB is not running"
          if prompt_yes_no "Would you like to start MongoDB now?" "Y"; then
            start_mongodb_local
          fi
        else
          print_error "MongoDB is not installed locally"
          print_warning "Falling back to MongoDB Atlas"
          mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
          use_local_mongodb=false
          break
        fi
        mongodb_uri=$(prompt_with_default "Enter your local MongoDB connection URI" "$default_uri")
        use_local_mongodb=true
        ;;
      4)
        # Install MongoDB locally
        print_warning "Installing MongoDB locally"
        if install_mongodb; then
          mongodb_uri="$default_uri"
          use_local_mongodb=true
        else
          print_warning "Falling back to MongoDB Atlas"
          mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
          use_local_mongodb=false
        fi
        ;;
      *)
        # Invalid option
        print_error "Invalid option. Defaulting to MongoDB Atlas."
        mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
        use_local_mongodb=false
        ;;
    esac
  fi

  # Return both URI and whether using local MongoDB as an array
  echo "$mongodb_uri:$use_local_mongodb"
}

# Function to set up MongoDB with Docker
setup_mongodb_docker() {
  print_step "Starting MongoDB with Docker"

  # Navigate to root directory which contains docker-compose.yml
  local script_dir=$(dirname "$0")
  local root_dir=$(dirname "$script_dir")

  cd "$root_dir" || { print_error "Could not navigate to project root directory"; exit 1; }

  if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found in project root directory."
    print_warning "Cannot start MongoDB with Docker. Using default connection string."
    mongodb_uri="$default_uri"
    use_docker=false
    use_local_mongodb=false
  else
    # Create .env file with necessary MongoDB configurations
    cat > .env << EOL
USE_LOCAL_MONGODB=true
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=password
MONGODB_DATABASE=job-tracking
EOL
    print_success "Created .env file with USE_LOCAL_MONGODB=true"

    # Start only the MongoDB container with the local-mongodb profile
    docker-compose --profile local-mongodb up -d mongodb
    if [ $? -ne 0 ]; then
      print_error "Failed to start MongoDB container"
      print_warning "Falling back to MongoDB Atlas"
      mongodb_uri=$(prompt_with_default "Enter your MongoDB Atlas connection URI" "$default_atlas_uri")
      use_docker=false
      use_local_mongodb=false
    else
      print_success "MongoDB Docker container is running"
      # Use the default MongoDB URI for Docker
      mongodb_uri="mongodb://admin:password@localhost:27017/job-tracking"
    fi
  fi

  # Navigate back to original directory
  cd - > /dev/null
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

# Get MongoDB URI from user or use Docker - split the result to get both URI and flag
MONGODB_RESULT=$(get_mongodb_uri)
# Split the result by colon
MONGODB_URI=$(echo "$MONGODB_RESULT" | cut -d':' -f1)
USE_LOCAL_MONGODB=$(echo "$MONGODB_RESULT" | cut -d':' -f2)

# Create backend .env file
print_step "Creating backend configuration"
BACKEND_PORT=$(prompt_with_default "Enter the port for the backend server" "5000")
NODE_ENV=$(prompt_with_default "Enter the NODE_ENV value" "development")

# Create the backend/.env file based on MongoDB choice
if [ "$USE_LOCAL_MONGODB" = "true" ]; then
    BACKEND_ENV_CONTENT="PORT=$BACKEND_PORT
MONGODB_URI=$MONGODB_URI
NODE_ENV=$NODE_ENV
USE_LOCAL_MONGODB=true
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=password
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DATABASE=job-tracking
MONGODB_USERNAME=admin
MONGODB_PASSWORD=password"
else
    BACKEND_ENV_CONTENT="PORT=$BACKEND_PORT
MONGODB_URI=$MONGODB_URI
NODE_ENV=$NODE_ENV
USE_LOCAL_MONGODB=false
MONGODB_ATLAS_URI=$MONGODB_URI"
fi

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