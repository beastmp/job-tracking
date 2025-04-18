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

# Function to update .env file or create if it doesn't exist
function Update-EnvFile {
    param(
        [string]$FilePath,
        [string]$Content
    )

    if (Test-Path -Path $FilePath) {
        # File exists, read its content
        $existingContent = Get-Content -Path $FilePath -Raw

        # Parse existing content into a hashtable
        $existingValues = @{}
        $existingContent -split "`n" | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $keyValue = $line -split "=", 2
                if ($keyValue.Count -eq 2) {
                    $existingValues[$keyValue[0].Trim()] = $keyValue[1].Trim()
                }
            }
        }

        # Parse new content into a hashtable
        $newValues = @{}
        $Content -split "`n" | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $keyValue = $line -split "=", 2
                if ($keyValue.Count -eq 2) {
                    $newValues[$keyValue[0].Trim()] = $keyValue[1].Trim()
                }
            }
        }

        # Check if there are any differences
        $isDifferent = $false
        foreach ($key in $newValues.Keys) {
            if (-not $existingValues.ContainsKey($key) -or $existingValues[$key] -ne $newValues[$key]) {
                $isDifferent = $true
                break
            }
        }

        if ($isDifferent) {
            # Ask if the user wants to update the file
            Write-Host "The existing .env file at $FilePath has different values." -ForegroundColor Yellow
            $updateFile = Read-YesNo "Do you want to update the file with new values?" "Y"

            if ($updateFile) {
                # Create a backup first
                $backupPath = "$FilePath.backup"
                Copy-Item -Path $FilePath -Destination $backupPath -Force

                # Update the file
                Set-Content -Path $FilePath -Value $Content -Encoding UTF8
                Write-Host "✅ Updated file: $FilePath (backup created at $backupPath)" -ForegroundColor Green
            } else {
                Write-Host "✅ Keeping existing file: $FilePath" -ForegroundColor Green
            }
        } else {
            Write-Host "✅ File already exists with same values: $FilePath" -ForegroundColor Green
        }
    } else {
        # File doesn't exist, create it
        Set-Content -Path $FilePath -Value $Content -Encoding UTF8
        Write-Host "✅ Created file: $FilePath" -ForegroundColor Green
    }
}

# Function to get MongoDB URI from user or use Docker
function Get-MongoDbUri {
    $defaultUri = "mongodb://localhost:27017/job-tracking"
    $defaultAtlasUri = "mongodb+srv://username:password@cluster0.mongodb.net/job-tracking"
    $useDocker = $false
    $mongodbUri = $defaultUri
    $useLocalMongodb = $false
    $mongoDbLocalInstalled = $false

    # Check if MongoDB is already installed locally
    try {
        $mongoVersion = mongod --version | Out-String
        if ($mongoVersion -match "db version v(\d+\.\d+\.\d+)") {
            Write-Host "✅ MongoDB is already installed locally (version: $($Matches[1]))" -ForegroundColor Green
            $mongoDbLocalInstalled = $true
        }
    } catch {
        $mongoDbLocalInstalled = $false
    }

    # Check if MongoDB service is running
    $mongoDbRunning = $false
    if ($mongoDbLocalInstalled) {
        try {
            $mongoStatus = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
            if ($mongoStatus -and $mongoStatus.Status -eq "Running") {
                Write-Host "✅ MongoDB service is running" -ForegroundColor Green
                $mongoDbRunning = $true
            } else {
                Write-Host "⚠️ MongoDB is installed but service is not running" -ForegroundColor Yellow
                try {
                    Start-Service -Name "MongoDB" -ErrorAction SilentlyContinue
                    Write-Host "✅ Successfully started MongoDB service" -ForegroundColor Green
                    $mongoDbRunning = $true
                } catch {
                    Write-Host "❌ Failed to start MongoDB service" -ForegroundColor Red
                }
            }
        } catch {
            Write-Host "⚠️ MongoDB service not found" -ForegroundColor Yellow
        }
    }

    # Check if Docker is available and running
    $dockerAvailable = $false
    $dockerRunning = $false
    try {
        # Check if Docker is installed
        docker --version | Out-Null
        docker-compose --version | Out-Null
        $dockerAvailable = $true

        # Check if Docker is running by trying a simple command
        docker info | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Docker is running" -ForegroundColor Green
            $dockerRunning = $true
        } else {
            Write-Host "⚠️ Docker is installed but not running" -ForegroundColor Yellow
            $dockerRunning = $false
        }
    } catch {
        $dockerAvailable = $false
        $dockerRunning = $false
        Write-Host "⚠️ Docker is not available on this system" -ForegroundColor Yellow
    }

    # Function to check MongoDB connection
    function Test-MongoDbConnection {
        param(
            [string]$ConnectionString
        )

        try {
            # If mongosh is available, use it to test connection
            if (Get-Command mongosh -ErrorAction SilentlyContinue) {
                $testCommand = "mongosh `"$ConnectionString`" --eval `"db.runCommand({ping:1})`" --quiet"
                $result = Invoke-Expression $testCommand -ErrorAction SilentlyContinue
                if ($result -match "1") {
                    return $true
                }
            }
            return $false
        } catch {
            return $false
        }
    }

    # Make automatic decision if specified
    $autoDecide = (Read-YesNo "Do you want the script to automatically choose the best MongoDB option?" "Y")

    if ($autoDecide) {
        # Automatic decision logic
        if ($mongoDbRunning) {
            # Use existing local MongoDB if it's already running
            Write-Host "🔄 Automatically selecting local MongoDB instance" -ForegroundColor Cyan
            $mongodbUri = $defaultUri
            $useLocalMongodb = $true

            # Test connection
            if (Test-MongoDbConnection -ConnectionString $mongodbUri) {
                Write-Host "✅ Successfully connected to local MongoDB" -ForegroundColor Green
            } else {
                Write-Host "⚠️ Local MongoDB connection test failed, but proceeding anyway" -ForegroundColor Yellow
            }
        } elseif ($dockerAvailable -and $dockerRunning) {
            # Use Docker if available and no local MongoDB
            $useDocker = $true
            $useLocalMongodb = $true
            Write-Host "🔄 Automatically selecting Docker for MongoDB" -ForegroundColor Cyan

            # Start MongoDB container
            Write-StepHeader "Starting MongoDB with Docker"

            # Navigate to root directory which contains docker-compose.yml
            $scriptDir = $PSScriptRoot
            $rootDir = Split-Path -Parent $scriptDir

            $dockerResult = Setup-MongoDbDocker -rootDir $rootDir
            if (-not $dockerResult.Success) {
                Write-Host "❌ Failed to start MongoDB container" -ForegroundColor Red
                Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                $useDocker = $false
                $useLocalMongodb = $false
            } else {
                Write-Host "✅ MongoDB Docker container is running" -ForegroundColor Green
                $mongodbUri = $dockerResult.Uri
            }

        } else {
            # Try to install MongoDB automatically
            Write-Host "🔄 No local MongoDB or Docker found. Attempting to install MongoDB automatically..." -ForegroundColor Cyan

            # Check for Chocolatey
            $chocoInstalled = $false
            try {
                choco --version | Out-Null
                $chocoInstalled = $true
            } catch {
                $chocoInstalled = $false
            }

            if (-not $chocoInstalled) {
                Write-Host "🔄 Installing Chocolatey package manager..." -ForegroundColor Cyan
                try {
                    Set-ExecutionPolicy Bypass -Scope Process -Force
                    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
                    $installCommand = "(New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1') | Invoke-Expression"
                    Invoke-Expression -Command $installCommand

                    # Refresh environment variables
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

                    Write-Host "✅ Chocolatey installed successfully" -ForegroundColor Green
                    $chocoInstalled = $true
                } catch {
                    Write-Host "❌ Failed to install Chocolatey" -ForegroundColor Red
                }
            }

            # Install MongoDB using Chocolatey
            if ($chocoInstalled) {
                Write-Host "🔄 Installing MongoDB using Chocolatey..." -ForegroundColor Cyan
                try {
                    choco install mongodb -y

                    # Refresh environment variables
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

                    Write-Host "✅ MongoDB installed successfully" -ForegroundColor Green

                    # Try to start MongoDB service
                    try {
                        Start-Service -Name MongoDB
                        Write-Host "✅ MongoDB service started" -ForegroundColor Green
                        $mongoDbRunning = $true
                        $useLocalMongodb = $true
                    } catch {
                        Write-Host "❌ Failed to start MongoDB service" -ForegroundColor Red
                    }
                } catch {
                    Write-Host "❌ Failed to install MongoDB" -ForegroundColor Red
                }
            }

            # If automatic installation failed, use Atlas
            if (-not $mongoDbRunning) {
                Write-Host "⚠️ Automatic MongoDB setup failed. Falling back to MongoDB Atlas." -ForegroundColor Yellow
                $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                $useLocalMongodb = $false
            }
        }
    } else {
        # Manual selection
        Write-Host "MongoDB Connection Options:" -ForegroundColor Yellow
        Write-Host "1) Use MongoDB Atlas (cloud-hosted)" -ForegroundColor White
        Write-Host "2) Use MongoDB locally with Docker" -ForegroundColor White
        Write-Host "3) Use existing local MongoDB instance" -ForegroundColor White
        if (-not $mongoDbLocalInstalled) {
            Write-Host "4) Install MongoDB locally (automatic)" -ForegroundColor White
        }
        $mongoChoice = Read-Host "Choose MongoDB connection option [1-4] (default: 2)"

        if ([string]::IsNullOrWhiteSpace($mongoChoice)) {
            $mongoChoice = "2"
        }

        switch ($mongoChoice) {
            "1" {
                # MongoDB Atlas option
                Write-Host "Using MongoDB Atlas (cloud-hosted)" -ForegroundColor Cyan
                $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                $useLocalMongodb = $false
            }
            "2" {
                # Docker option
                Write-Host "Using local MongoDB via Docker" -ForegroundColor Cyan

                try {
                    # Check if Docker is installed
                    docker --version | Out-Null
                    docker-compose --version | Out-Null

                    # Check if Docker is running
                    docker info | Out-Null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "❌ Docker is installed but not running" -ForegroundColor Red
                        $startDocker = Read-YesNo "Would you like to try starting Docker Desktop now?" "Y"
                        if ($startDocker) {
                            Write-Host "🔄 Attempting to start Docker Desktop..." -ForegroundColor Cyan
                            try {
                                Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
                                Write-Host "⏳ Waiting for Docker to start (this may take a minute)..." -ForegroundColor Cyan

                                # Wait for Docker to start (try up to 6 times with 10 second intervals)
                                $dockerStarted = $false
                                for ($i = 0; $i -lt 6; $i++) {
                                    Start-Sleep -Seconds 10
                                    docker info | Out-Null
                                    if ($LASTEXITCODE -eq 0) {
                                        Write-Host "✅ Docker started successfully" -ForegroundColor Green
                                        $dockerStarted = $true
                                        break
                                    }
                                    Write-Host "⏳ Still waiting for Docker to start..." -ForegroundColor Yellow
                                }

                                if (-not $dockerStarted) {
                                    Write-Host "❌ Docker failed to start in the expected time" -ForegroundColor Red
                                    Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                                    $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                                    $useDocker = $false
                                    $useLocalMongodb = $false

                                    # Skip the rest of the Docker setup
                                    break
                                }
                            } catch {
                                Write-Host "❌ Failed to start Docker Desktop" -ForegroundColor Red
                                Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                                $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                                $useDocker = $false
                                $useLocalMongodb = $false

                                # Skip the rest of the Docker setup
                                break
                            }
                        } else {
                            # User chose not to start Docker
                            Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                            $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                            $useDocker = $false
                            $useLocalMongodb = $false

                            # Skip the rest of the Docker setup
                            break
                        }
                    }

                    # Docker is running, so proceed with setup
                    $useDocker = $true
                    $useLocalMongodb = $true

                    # Start MongoDB container
                    Write-StepHeader "Starting MongoDB with Docker"

                    # Navigate to root directory which contains docker-compose.yml
                    $scriptDir = $PSScriptRoot
                    $rootDir = Split-Path -Parent $scriptDir

                    $dockerResult = Setup-MongoDbDocker -rootDir $rootDir
                    if (-not $dockerResult.Success) {
                        Write-Host "❌ Failed to start MongoDB container" -ForegroundColor Red
                        Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                        $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                        $useDocker = $false
                        $useLocalMongodb = $false
                    } else {
                        Write-Host "✅ MongoDB Docker container is running" -ForegroundColor Green
                        $mongodbUri = $dockerResult.Uri
                    }

                } catch {
                    Write-Host "❌ Docker or docker-compose not found. Cannot start MongoDB container." -ForegroundColor Red
                    Write-Host "⚠️ Falling back to MongoDB Atlas. Enter your connection details:" -ForegroundColor Yellow
                    $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                    $useDocker = $false
                    $useLocalMongodb = $false
                }
            }
            "3" {
                # Local MongoDB instance option
                Write-Host "Using existing local MongoDB instance" -ForegroundColor Cyan
                if ($mongoDbRunning) {
                    Write-Host "✅ Local MongoDB is running" -ForegroundColor Green
                } else {
                    Write-Host "⚠️ Local MongoDB is not running or not detected. Starting up if possible..." -ForegroundColor Yellow
                    try {
                        Start-Service -Name MongoDB -ErrorAction SilentlyContinue
                        Write-Host "✅ MongoDB service started" -ForegroundColor Green
                    } catch {
                        Write-Host "❌ Failed to start MongoDB service" -ForegroundColor Red
                    }
                }
                $mongodbUri = Read-InputWithDefault "Enter your local MongoDB connection URI" $defaultUri
                $useLocalMongodb = $true
            }
            "4" {
                # Install MongoDB locally
                if (-not $mongoDbLocalInstalled) {
                    Write-Host "Installing MongoDB locally..." -ForegroundColor Cyan

                    # Check for Chocolatey
                    $chocoInstalled = $false
                    try {
                        choco --version | Out-Null
                        $chocoInstalled = $true
                    } catch {
                        $chocoInstalled = $false
                    }

                    if (-not $chocoInstalled) {
                        Write-Host "Installing Chocolatey package manager..." -ForegroundColor Cyan
                        try {
                            Set-ExecutionPolicy Bypass -Scope Process -Force
                            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
                            $installCommand = "(New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1') | Invoke-Expression"
                            Invoke-Expression -Command $installCommand

                            # Refresh environment variables
                            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

                            Write-Host "✅ Chocolatey installed successfully" -ForegroundColor Green
                            $chocoInstalled = $true
                        } catch {
                            Write-Host "❌ Failed to install Chocolatey" -ForegroundColor Red
                        }
                    }

                    # Install MongoDB using Chocolatey
                    if ($chocoInstalled) {
                        try {
                            choco install mongodb -y

                            # Refresh environment variables
                            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

                            Write-Host "✅ MongoDB installed successfully" -ForegroundColor Green

                            # Try to start MongoDB service
                            try {
                                Start-Service -Name MongoDB
                                Write-Host "✅ MongoDB service started" -ForegroundColor Green
                                $mongoDbRunning = $true
                            } catch {
                                Write-Host "❌ Failed to start MongoDB service" -ForegroundColor Red
                            }
                        } catch {
                            Write-Host "❌ Failed to install MongoDB" -ForegroundColor Red
                        }
                    }
                }

                # Set MongoDB URI
                $mongodbUri = $defaultUri
                $useLocalMongodb = $true
            }
            default {
                # Default to Docker option if invalid input
                Write-Host "Invalid option. Defaulting to MongoDB Atlas." -ForegroundColor Yellow
                $mongodbUri = Read-InputWithDefault "Enter your MongoDB Atlas connection URI" $defaultAtlasUri
                $useLocalMongodb = $false
            }
        }
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

# Function to setup MongoDB using Docker with Windows network handling - no authentication
function Setup-MongoDbDocker {
    param (
        [string]$rootDir
    )

    Push-Location -Path $rootDir

    try {
        # Create .env file with necessary MongoDB configurations - simplified without authentication
        $envContent = @"
USE_LOCAL_MONGODB=true
MONGODB_DATABASE=job-tracking
"@
        Update-EnvFile -FilePath ".env" -Value $envContent
        Write-Host "✅ Created or updated .env file with simplified MongoDB configurations" -ForegroundColor Green

        # Create a properly configured network for Windows using nat driver
        Write-Host "🔄 Setting up Docker network for MongoDB..." -ForegroundColor Cyan

        # Check if the job-tracking network exists
        $networkName = "job-tracking-network"
        $networkExists = docker network ls --filter "name=$networkName" --format "{{.Name}}" | Out-String

        # If network doesn't exist, create it with the nat driver on Windows
        if (-not $networkExists.Contains($networkName)) {
            Write-Host "🔄 Creating '$networkName' network with nat driver (Windows-compatible)..." -ForegroundColor Cyan
            docker network create --driver nat $networkName
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️ Could not create network with nat driver, falling back to direct container..." -ForegroundColor Yellow
            } else {
                Write-Host "✅ Created network '$networkName' successfully" -ForegroundColor Green
            }
        }

        # Check if container already exists and remove if it does
        $containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "job-tracking-mongodb" -Quiet
        if ($containerExists) {
            Write-Host "🔄 Stopping and removing existing MongoDB container..." -ForegroundColor Yellow
            docker stop job-tracking-mongodb | Out-Null
            docker rm job-tracking-mongodb | Out-Null
        }

        # Start MongoDB without authentication
        Write-Host "🔄 Starting MongoDB container without authentication..." -ForegroundColor Cyan
        try {
            if (docker network ls --filter "name=$networkName" --format "{{.Name}}" | Select-String -Pattern $networkName -Quiet) {
                docker run --name job-tracking-mongodb -d `
                    --network $networkName `
                    -p 27017:27017 `
                    -e MONGO_INITDB_DATABASE=job-tracking `
                    mongo:6
            } else {
                docker run --name job-tracking-mongodb -d `
                    -p 27017:27017 `
                    -e MONGO_INITDB_DATABASE=job-tracking `
                    mongo:6
            }

            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ MongoDB container started without authentication" -ForegroundColor Green

                # Simple connection string without authentication
                $mongodbUri = "mongodb://localhost:27017/job-tracking"

                # Wait for MongoDB to initialize
                Write-Host "🔄 Waiting for MongoDB to initialize..." -ForegroundColor Cyan
                Start-Sleep -Seconds 5

                Write-Host "✅ MongoDB connection URI configured: $mongodbUri" -ForegroundColor Green

                return @{
                    Success = $true
                    Uri = $mongodbUri
                }
            } else {
                Write-Host "❌ Failed to start MongoDB container" -ForegroundColor Red
                return @{
                    Success = $false
                    Uri = ""
                }
            }
        } catch {
            Write-Host "❌ Error starting MongoDB container: $_" -ForegroundColor Red
            return @{
                Success = $false
                Uri = ""
            }
        }
    } catch {
        Write-Host "❌ Error starting MongoDB container: $_" -ForegroundColor Red
        return @{
            Success = $false
            Uri = ""
        }
    } finally {
        # Go back to original directory
        Pop-Location
    }
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
$rootDir = Split-Path -Parent $scriptDir

# Set locations relative to the root directory directly (fix for path issues)
$backendDir = Join-Path -Path $rootDir -ChildPath "backend"
$frontendDir = Join-Path -Path $rootDir -ChildPath "frontend"

# Ensure directories exist or create them
if (-not (Test-Path -Path $backendDir)) {
    Write-Host "⚠️ Backend directory not found at: $backendDir" -ForegroundColor Yellow
    Write-Host "🔄 Attempting to locate backend directory..." -ForegroundColor Cyan

    # Try to find the backend directory
    $possibleBackendDir = Join-Path -Path $rootDir -ChildPath "..\backend"
    if (Test-Path -Path $possibleBackendDir) {
        $backendDir = (Get-Item $possibleBackendDir).FullName
        Write-Host "✅ Found backend directory at: $backendDir" -ForegroundColor Green
    } else {
        # Try one more location
        $possibleBackendDir = Join-Path -Path (Split-Path -Parent $rootDir) -ChildPath "backend"
        if (Test-Path -Path $possibleBackendDir) {
            $backendDir = (Get-Item $possibleBackendDir).FullName
            Write-Host "✅ Found backend directory at: $backendDir" -ForegroundColor Green
        } else {
            # Create the directory if it doesn't exist
            try {
                New-Item -ItemType Directory -Path $backendDir -Force | Out-Null
                Write-Host "✅ Created backend directory at: $backendDir" -ForegroundColor Green
            } catch {
                Write-Host "❌ Could not create backend directory. Using current path as fallback." -ForegroundColor Red
                $backendDir = $rootDir
            }
        }
    }
}

if (-not (Test-Path -Path $frontendDir)) {
    Write-Host "⚠️ Frontend directory not found at: $frontendDir" -ForegroundColor Yellow
    Write-Host "🔄 Attempting to locate frontend directory..." -ForegroundColor Cyan

    # Try to find the frontend directory
    $possibleFrontendDir = Join-Path -Path $rootDir -ChildPath "..\frontend"
    if (Test-Path -Path $possibleFrontendDir) {
        $frontendDir = (Get-Item $possibleFrontendDir).FullName
        Write-Host "✅ Found frontend directory at: $frontendDir" -ForegroundColor Green
    } else {
        # Try one more location
        $possibleFrontendDir = Join-Path -Path (Split-Path -Parent $rootDir) -ChildPath "frontend"
        if (Test-Path -Path $possibleFrontendDir) {
            $frontendDir = (Get-Item $possibleFrontendDir).FullName
            Write-Host "✅ Found frontend directory at: $frontendDir" -ForegroundColor Green
        } else {
            # Create the directory if it doesn't exist
            try {
                New-Item -ItemType Directory -Path $frontendDir -Force | Out-Null
                Write-Host "✅ Created frontend directory at: $frontendDir" -ForegroundColor Green
            } catch {
                Write-Host "❌ Could not create frontend directory. Using current path as fallback." -ForegroundColor Red
                $frontendDir = $rootDir
            }
        }
    }
}

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
    # Simplified MongoDB URI without authentication
    $backendEnvContent = @"
PORT=$backendPort
MONGODB_URI=mongodb://localhost:27017/job-tracking
NODE_ENV=$nodeEnv
USE_LOCAL_MONGODB=true
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=job-tracking
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
Update-EnvFile -FilePath $backendEnvPath -Content $backendEnvContent

# Create frontend .env file
Write-StepHeader "Creating frontend configuration"
$apiUrl = Read-InputWithDefault "Enter the API URL for the frontend to connect to" "http://localhost:$backendPort/api"

# Create the frontend/.env file
$frontendEnvContent = @"
REACT_APP_API_URL=$apiUrl
"@

$frontendEnvPath = Join-Path -Path $frontendDir -ChildPath ".env"
Update-EnvFile -FilePath $frontendEnvPath -Content $frontendEnvContent

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
    Update-EnvFile -FilePath $tempEnvPath -Content $tempEnvContent

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