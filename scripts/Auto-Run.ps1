# Comprehensive automated setup and run script for Job Tracking Application
# This script handles all steps required to set up and run the application

# Print header with colored text
function Write-ColoredHeader {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host "Job Tracking Application - Automated Setup & Run" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
}

# Function to display a step header
function Write-StepHeader {
    param([string]$StepName)
    Write-Host "`n[STEP] $StepName" -ForegroundColor Blue
}

# Function to prompt user for input with default value
function Read-InputWithDefault {
    param(
        [string]$Prompt,
        [string]$Default
    )

    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

# Function to prompt for yes/no with default
function Read-YesNo {
    param(
        [string]$Prompt,
        [string]$Default = "Y"
    )

    if ($Default -eq "Y") {
        $input = Read-Host "$Prompt [Y/n]"
        if ([string]::IsNullOrWhiteSpace($input) -or $input -eq "Y" -or $input -eq "y") {
            return $true
        }
    } else {
        $input = Read-Host "$Prompt [y/N]"
        if ($input -eq "Y" -or $input -eq "y") {
            return $true
        }
    }
    return $false
}

# Function to create file with content if it doesn't exist
function New-FileIfNotExists {
    param(
        [string]$FilePath,
        [string]$Content
    )

    if (-not (Test-Path -Path $FilePath)) {
        Set-Content -Path $FilePath -Value $Content -Encoding UTF8
        Write-Host "✅ Created file: $FilePath" -ForegroundColor Green
    } else {
        Write-Host "✅ File already exists: $FilePath" -ForegroundColor Green
    }
}

# Function to get MongoDB URI from user or use Docker
function Get-MongoDbUri {
    $defaultUri = "mongodb://localhost:27017/job-tracking"
    $useDocker = $false
    $mongodbUri = $defaultUri
    $useLocalMongodb = $false

    try {
        docker --version | Out-Null
        docker-compose --version | Out-Null

        if (Read-YesNo "Would you like to use Docker for MongoDB?" "Y") {
            $useDocker = $true
            $useLocalMongodb = $true
            # Start MongoDB container
            Write-StepHeader "Starting MongoDB with Docker"

            # Navigate to backend directory which should contain docker-compose.yml
            $scriptDir = $PSScriptRoot
            $rootDir = Split-Path -Parent (Split-Path -Parent $scriptDir)
            $backendDir = Join-Path -Path $rootDir -ChildPath "backend"

            Push-Location -Path $backendDir
            if (-not (Test-Path -Path "docker-compose.yml")) {
                Write-Host "⚠️ docker-compose.yml not found in backend directory. Creating one..." -ForegroundColor Yellow
                @"
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
"@ | Set-Content -Path "docker-compose.yml" -Encoding UTF8
                Write-Host "✅ Created docker-compose.yml file" -ForegroundColor Green
            }

            # Create .env file with USE_LOCAL_MONGODB=true
            $envContent = @"
USE_LOCAL_MONGODB=true
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=password
MONGODB_DATABASE=job-tracking
"@
            Set-Content -Path ".env" -Value $envContent -Encoding UTF8
            Write-Host "✅ Created .env file with USE_LOCAL_MONGODB=true" -ForegroundColor Green

            # Start MongoDB container in detached mode with local-mongodb profile
            docker-compose --profile local-mongodb up -d mongodb

            # Go back to original directory
            Pop-Location

            Write-Host "✅ MongoDB Docker container is running" -ForegroundColor Green
        } else {
            # User doesn't want to use Docker
            Write-Host "⚠️ Not using Docker for MongoDB" -ForegroundColor Yellow
            $mongodbUri = Read-InputWithDefault "Enter your MongoDB connection URI" $defaultUri
            $useLocalMongodb = $false
        }
    } catch {
        Write-Host "⚠️ Docker or docker-compose not found. Cannot start MongoDB container." -ForegroundColor Yellow
        $mongodbUri = Read-InputWithDefault "Enter your MongoDB connection URI" $defaultUri
        $useLocalMongodb = $false
    }

    return @{
        Uri = $mongodbUri
        UseLocalMongodb = $useLocalMongodb
    }
}

# Function to check if command exists (simplified version for PowerShell)
function Test-CommandExists {
    param([string]$Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

# Display header
Write-ColoredHeader

# Check prerequisite tools and versions
Write-StepHeader "Checking prerequisites"

# Check for Node.js
try {
    $nodeVersion = node -v
    if ($nodeVersion -match "v(\d+)\.\d+\.\d+") {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -lt 16) {
            Write-Host "❌ Error: Node.js version must be v16 or higher. Current version: $nodeVersion" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Error: Could not determine Node.js version." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: Node.js is not installed. Please install Node.js v16 or higher." -ForegroundColor Red
    exit 1
}

# Check for npm
try {
    $npmVersion = npm -v
    if ($npmVersion -match "(\d+)\.\d+\.\d+") {
        $npmMajor = [int]$Matches[1]
        if ($npmMajor -lt 8) {
            Write-Host "⚠️ npm version should be v8 or higher for best compatibility. Current version: $npmVersion" -ForegroundColor Yellow
        }
        Write-Host "✅ npm v$npmVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Error: Could not determine npm version." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: npm is not installed. It should come with Node.js." -ForegroundColor Red
    exit 1
}

# Setup environment configuration
Write-StepHeader "Setting up environment configuration"

# Get script directory and root directory
$scriptDir = $PSScriptRoot
$rootDir = Split-Path -Parent (Split-Path -Parent $scriptDir)

# Set locations relative to the root directory
$backendDir = Join-Path -Path $rootDir -ChildPath "backend"
$frontendDir = Join-Path -Path $rootDir -ChildPath "frontend"

# Get MongoDB URI from user or use Docker
$mongodbInfo = Get-MongoDbUri
$mongodbUri = $mongodbInfo.Uri
$useLocalMongodb = $mongodbInfo.UseLocalMongodb

# Create backend .env file
Write-StepHeader "Creating backend configuration"
$backendPort = Read-InputWithDefault "Enter the port for the backend server" "5000"
$nodeEnv = Read-InputWithDefault "Enter the NODE_ENV value" "development"

# Create the backend/.env file
if ($useLocalMongodb) {
    $backendEnvContent = @"
PORT=$backendPort
MONGODB_URI=$mongodbUri
NODE_ENV=$nodeEnv
USE_LOCAL_MONGODB=true
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=password
MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DATABASE=job-tracking
MONGODB_USERNAME=admin
MONGODB_PASSWORD=password
"@
} else {
    $backendEnvContent = @"
PORT=$backendPort
MONGODB_URI=$mongodbUri
NODE_ENV=$nodeEnv
USE_LOCAL_MONGODB=false
MONGODB_ATLAS_URI=$mongodbUri
"@
}

$backendEnvPath = Join-Path -Path $backendDir -ChildPath ".env"
New-FileIfNotExists -FilePath $backendEnvPath -Content $backendEnvContent

# Create frontend .env file
Write-StepHeader "Creating frontend configuration"
$apiUrl = Read-InputWithDefault "Enter the API URL for the frontend to connect to" "http://localhost:$backendPort/api"

# Create the frontend/.env file
$frontendEnvContent = @"
REACT_APP_API_URL=$apiUrl
"@

$frontendEnvPath = Join-Path -Path $frontendDir -ChildPath ".env"
New-FileIfNotExists -FilePath $frontendEnvPath -Content $frontendEnvContent

# Install dependencies
Write-StepHeader "Installing dependencies"

# Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Set-Location -Path $backendDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location -Path $scriptDir
Write-Host "✅ Backend dependencies installed" -ForegroundColor Green

# Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location -Path $frontendDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location -Path $scriptDir
Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green

# Prompt user for run mode
Write-StepHeader "Select run mode"
Write-Host "1) Traditional mode (separate backend and frontend servers)"
Write-Host "2) Serverless mode (using Vercel)"
$runMode = Read-Host "Select run mode [1/2] (default: 1)"
if ([string]::IsNullOrWhiteSpace($runMode)) {
    $runMode = "1"
}

if ($runMode -eq "1") {
    Write-StepHeader "Starting application in traditional mode"

    # Function to start the backend server
    function Start-BackendServer {
        Write-Host "Starting backend server..." -ForegroundColor Yellow
        Set-Location -Path $backendDir
        $backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WindowStyle Normal -PassThru
        Set-Location -Path $scriptDir
        Write-Host "✅ Backend server started (PID: $($backendProcess.Id))" -ForegroundColor Green
        return $backendProcess
    }

    # Function to start the frontend server
    function Start-FrontendServer {
        Write-Host "Starting frontend server..." -ForegroundColor Yellow
        Set-Location -Path $frontendDir
        $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WindowStyle Normal -PassThru
        Set-Location -Path $scriptDir
        Write-Host "✅ Frontend server started (PID: $($frontendProcess.Id))" -ForegroundColor Green
        return $frontendProcess
    }

    # Start the servers
    $backendProcess = Start-BackendServer
    $frontendProcess = Start-FrontendServer

    # Display access information
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host "Job Tracking Application is running!" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host "Backend API: http://localhost:$backendPort/api"
    Write-Host "Frontend UI: http://localhost:3000"
    Write-Host ""
    Write-Host "Press Enter to stop all servers" -ForegroundColor Yellow
    Write-Host "=====================================================" -ForegroundColor Cyan

    # Wait for user input
    Read-Host

    # Cleanup when user presses Enter
    Write-Host ""
    Write-Host "Shutting down servers..." -ForegroundColor Yellow

    if ($backendProcess -ne $null) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Backend server stopped" -ForegroundColor Green
    }

    if ($frontendProcess -ne $null) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Frontend server stopped" -ForegroundColor Green
    }

} else {
    Write-StepHeader "Starting application in serverless mode"

    # Check for Vercel CLI
    if (-not (Test-CommandExists -Command "vercel")) {
        Write-Host "⚠️ Vercel CLI is not installed. Installing now..." -ForegroundColor Yellow
        npm install -g vercel
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to install Vercel CLI. Please install it manually with: npm install -g vercel" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "✅ Vercel CLI is installed" -ForegroundColor Green

    # Create a temporary .env.local file for Vercel dev
    $tempEnvContent = @"
MONGODB_URI=$mongodbUri
NODE_ENV=$nodeEnv
PORT=3000
"@

    $tempEnvPath = Join-Path -Path $rootDir -ChildPath ".env.development.local"
    New-FileIfNotExists -FilePath $tempEnvPath -Content $tempEnvContent

    # Register cleanup for normal exit
    $cleanupAction = {
        Write-Host "`nCleaning up..." -ForegroundColor Yellow
        if (Test-Path -Path $tempEnvPath) {
            Remove-Item -Path $tempEnvPath -Force
            Write-Host "✅ Removed temporary environment file" -ForegroundColor Green
        }
    }

    # Start the Vercel development environment
    try {
        Write-Host "Starting Vercel development environment..." -ForegroundColor Yellow
        Set-Location -Path $rootDir

        # Display access information before starting vercel
        Write-Host ""
        Write-Host "=====================================================" -ForegroundColor Cyan
        Write-Host "Job Tracking Application will be running in serverless mode!" -ForegroundColor Green
        Write-Host "=====================================================" -ForegroundColor Cyan
        Write-Host "API and UI will both be available at: http://localhost:3000" -ForegroundColor White
        Write-Host "Press Ctrl+C in the terminal to stop the server" -ForegroundColor Yellow
        Write-Host "=====================================================" -ForegroundColor Cyan
        Write-Host ""

        # Run vercel dev
        vercel dev

    } finally {
        # Cleanup when vercel dev exits
        & $cleanupAction.GetNewClosure()
        Write-Host "Goodbye!" -ForegroundColor Cyan
    }
}

# Return to the original script directory before exiting
Set-Location -Path $scriptDir