# Auto-Run Scripts for Job Tracking Application

I've created two comprehensive automated scripts that handle the complete setup and running of the job tracking application:

1. **Shell script** (`scripts/auto-run.sh`) for Linux/macOS users
2. **PowerShell script** (`scripts/Auto-Run.ps1`) for Windows users

## Features

Both scripts are fully interactive and provide a seamless experience by:

1. **Checking prerequisites** (Node.js, npm, Docker)
2. **Automatically configuring MongoDB**:
   - Offering to use Docker (creating docker-compose.yml if needed)
   - Prompting for connection details if Docker isn't available
3. **Setting up environment variables**:
   - Creating .env files for both backend and frontend
   - Prompting for customized values with sensible defaults
4. **Installing dependencies** for both backend and frontend
5. **Running the application** with a choice between:
   - Traditional mode (separate backend and frontend servers)
   - Serverless mode (using Vercel)
6. **Cleaning up** when the application is stopped

## Usage Instructions

These scripts make it easy to get started with the job tracking application. You simply need to run:

### For Windows Users

```powershell
# Navigate to the project root directory
cd path\to\job-tracking

# Run the PowerShell script
.\scripts\Auto-Run.ps1

# If you encounter execution policy restrictions, you may need to run:
# Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# .\scripts\Auto-Run.ps1
```

### For Linux/macOS Users

```bash
# Navigate to the project root directory
cd path/to/job-tracking

# Make the script executable (if not already)
chmod +x scripts/auto-run.sh

# Run the shell script
./scripts/auto-run.sh
```

### Running from Project Root

If you're running the script from the project root directory, you can use relative paths:

```bash
# For Windows
.\scripts\Auto-Run.ps1

# For Linux/macOS
./scripts/auto-run.sh
```

## Additional Information

The scripts are designed to be robust and handle various scenarios, creating any missing configuration files and guiding you through the setup process with clear prompts and sensible defaults. When the application is running, the scripts provide clear information about the URLs to access the application and offer clean shutdown options.