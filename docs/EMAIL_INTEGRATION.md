# Email Integration for Job Tracking Application

This document provides an overview of the Email Integration feature for the Job Tracking application, which allows users to automatically import job applications and status updates from their email accounts.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Technical Implementation](#technical-implementation)
4. [Data Flow](#data-flow)
5. [Security Considerations](#security-considerations)
6. [Environment Configuration](#environment-configuration)
7. [Future Enhancements](#future-enhancements)

## Overview

The Email Integration feature connects to a user's email account via IMAP, searches for job-related emails, and extracts relevant information about job applications and status updates. This information can then be imported into the application to keep the job tracking database up-to-date with minimal manual effort.

### Supported Email Providers

The integration works with any email provider that supports IMAP, including:
- Gmail
- Outlook
- Yahoo Mail
- Custom email servers

## Features

### 1. Email Connection Management

Users can:
- Add, edit, and delete email account credentials
- Have multiple email accounts configured
- Configure search parameters including:
  - Search timeframe (in days)
  - Specific folders to search
- Choose from common email providers with pre-filled server settings
- Fetch available folders from the email server

### 2. Search Functionality

The search feature:
- Connects to the email server via IMAP
- Searches emails based on specified criteria
- Displays real-time progress with a progress bar
- Processes three types of emails:
  - Job applications (Subject: "your application was sent to")
  - Status updates (Subject: "your application was viewed by")
  - Responses (Subject: "your application to [] at []" - typically rejections)
- Extracts relevant data points from each email type
- Enriches job data using LinkedIn API when possible
- Compares results with existing jobs to avoid duplicates
- Displays a detailed list of found items

### 3. Import Functionality

The import feature:
- Allows selection of specific items to import
- Processes different types of items appropriately:
  1. Adds new applications to the job list
  2. Adds status updates to existing jobs
  3. Updates response status on existing jobs
- Shows import progress with a progress bar
- Provides a summary of import results

### 4. Sync Functionality

The sync feature:
- Combines search and import into a single operation
- Performs the entire process automatically
- Tracks the last sync time to optimize future syncs
- Has a "Force Full Search" option to ignore previous sync time

## Technical Implementation

### Credential Storage

- Email credentials are stored in the database with encrypted passwords
- Encryption uses AES-256-CBC with a random initialization vector
- The encryption key is derived from an environment variable (ENCRYPTION_KEY)
- Password handling follows security best practices with server-side encryption

### IMAP Connection

- Uses the `imap` Node.js package for IMAP connections
- Supports TLS encryption (configurable via REACT_APP_USE_TLS)
- Allows configuration of SSL certificate validation
- Configurable connection parameters (host, port) via environment variables

### Email Processing

- Uses `mailparser` to parse email content
- Uses `cheerio` for HTML parsing of email bodies
- Searches each configured folder sequentially
- Implements timeout handling to prevent stuck operations

### Data Extraction

Key data points extracted from emails:
- Source (LinkedIn, Indeed, etc.)
- External Job ID
- Job Title
- Company
- Company Location
- Location Type (Remote, On-site, Hybrid)
- Applied Date
- Application Through
- Status
- Response
- Job URL
- Notes

### Data Enrichment

When a job URL is found, the system attempts to enrich the data with:
- Full job description
- Employment Type
- Salary information
- Recruiter details
- Location information

### Backend Architecture

The email integration system consists of several key components:

1. **API Routes (`/api/emails/*`):**
   - `/api/emails/credentials` - CRUD operations for email credentials
   - `/api/emails/search-with-saved-credentials` - Search emails using stored credentials
   - `/api/emails/get-folders` - Fetch available email folders
   - `/api/emails/import-all` - Import all selected items
   - `/api/emails/sync` - Perform a complete search and import operation

2. **Models:**
   - `EmailCredentials` - Stores encrypted IMAP connection details and search parameters
   - `Job` - The main data model for storing job applications and their statuses

3. **Controllers:**
   - `emailController.js` - Handles all email-related operations including IMAP connections, email parsing, and data extraction

4. **Environment Configuration:**
   - All email integration settings are configurable via environment variables

### Search Flow

The email search process follows these steps:

1. **Credential Validation:**
   - The system retrieves email credentials either from the request or from the database
   - For stored credentials, the password is decrypted using the system encryption key

2. **IMAP Connection Setup:**
   - The system creates an IMAP connection configuration based on the provided credentials
   - A connection to the email server is established with appropriate error handling

3. **Search Parameters Configuration:**
   - Search timeframe is determined either by the user's configuration or the time since last import
   - Search folders are processed sequentially to avoid server timeouts
   - The system specifically targets LinkedIn job notification emails

4. **Email Processing:**
   - For each matching email, the system:
     - Parses the email content using `mailparser`
     - Identifies the email type (application, status update, or response)
     - Extracts relevant job data using regular expressions and HTML parsing
     - Compares against existing database entries to identify duplicates

5. **API URL Data Enrichment:**
   - For LinkedIn job applications, the system attempts to:
     - Extract the LinkedIn job ID from the URL
     - Fetch additional details from the LinkedIn job page or API
     - Extract detailed job description, employment type, and salary information

6. **Result Compilation:**
   - Found items are categorized by type (application, status update, response)
   - Each item is marked as new or existing
   - Results are returned to the frontend for display and selection

### Import Flow

The import process handles the different types of email data:

1. **Item Selection:**
   - Users can select which items to import from the search results
   - They can choose to import all items at once or select individual items

2. **Application Processing:**
   - For new job applications, the system:
     - Creates new Job records with all extracted data points
     - Sets default values for required fields (such as response status)
     - Links the job to the original source via external job ID or URL

3. **Status Update Processing:**
   - For status updates, the system:
     - Finds the matching job in the database using company name and job title
     - Adds a new status check entry with the date and information from the email
     - Updates the job's status if appropriate (based on status priority)

4. **Response Processing:**
   - For job responses (rejections, interviews, etc.), the system:
     - Finds the matching job using company name and job title
     - Updates the job's response status and response date
     - Adds notes about the response to the job record

5. **Database Updates:**
   - All changes are committed to the database in an optimized manner
   - Duplicate checks ensure no duplicate jobs are created
   - The system provides detailed statistics about the import operation

### Sync Flow

The sync operation combines search and import for a streamlined experience:

1. **Credential Selection:**
   - The user selects which email account to use for the sync operation
   - The "Force Full Search" option determines whether to use the last sync timestamp or perform a full search

2. **Automated Process:**
   - The system performs all search steps automatically
   - All new items are processed without requiring manual selection
   - Status updates and responses are applied to existing jobs

3. **Progress Tracking:**
   - The frontend displays real-time progress using a progress bar
   - Step-by-step messages inform the user about the current operation
   - The system handles potential errors and timeouts gracefully

4. **Timestamp Update:**
   - After a successful sync, the system updates the last import timestamp
   - This helps optimize future sync operations by limiting the search timeframe
   - The user receives a detailed summary of changes made during the sync

### Email Parsing Logic

The system uses sophisticated parsing techniques to extract job data:

1. **LinkedIn Application Emails:**
   - Matches subject pattern "your application was sent to [Company]"
   - Extracts company name from the subject line
   - Finds job title in the HTML structure
   - Identifies application date and job URL
   - Extracts location type (Remote, Hybrid, On-site) from location text

2. **Status Update Emails:**
   - Matches subject pattern "your application was viewed by [Company]"
   - Extracts company name from subject
   - Creates a status check entry with the email date
   - Attempts to find the job title in the email body

3. **Response Emails:**
   - Matches subject pattern "your application to [Job] at [Company]"
   - Extracts both job title and company name
   - Analyzes email content to determine if it's a rejection
   - Updates the job status accordingly

All parsing is designed to handle variations in email formatting while maintaining accuracy in data extraction.

## Data Flow

1. **Setup**: User configures email credentials and search parameters
2. **Search**:
   - Connect to IMAP server
   - Search each folder for matching emails
   - Parse emails to extract job data
   - Check for duplicates against existing jobs
   - Display results to user
3. **Import**:
   - Process selected items
   - Add new job applications
   - Update existing jobs with status changes
   - Mark emails as processed to prevent future duplicates
4. **Sync**:
   - Combine search and import steps
   - Update last sync timestamp
   - Provide summary of changes

## Security Considerations

- Passwords are encrypted in the database using AES-256-CBC encryption
- TLS is used for IMAP connections (configurable)
- SSL certificate validation is configurable
- No email content is permanently stored
- Credentials can be deleted at any time
- Environment variables are used for sensitive configuration
- Frontend never receives decrypted password data

## Environment Configuration

The email integration feature can be configured using the following environment variables:

### Backend Environment Variables
- `EMAIL_ADDRESS` - Default email address for integration
- `EMAIL_PROVIDER` - Default email provider (e.g., Gmail)
- `IMAP_HOST` - Default IMAP host for email server
- `IMAP_PORT` - Default IMAP port for email server
- `USE_TLS` - Whether to use TLS for email connections (true/false)
- `DEFAULT_SEARCH_TIMEFRAME_DAYS` - Default number of days to search for emails
- `DEFAULT_SEARCH_FOLDERS` - Default email folders to search (comma-separated)
- `EMAIL_IMPORT_BATCH_SIZE` - Number of emails to process in a batch
- `ENCRYPTION_KEY` - Key used for encrypting email credentials in the database

### Frontend Environment Variables
- `REACT_APP_EMAIL_ADDRESS` - Default email address for the form
- `REACT_APP_EMAIL_PROVIDER` - Default email provider for the form
- `REACT_APP_IMAP_HOST` - Default IMAP host for the form
- `REACT_APP_IMAP_PORT` - Default IMAP port for the form
- `REACT_APP_USE_TLS` - Whether to use TLS by default
- `REACT_APP_DEFAULT_SEARCH_TIMEFRAME_DAYS` - Default search timeframe for the form
- `REACT_APP_API_URL` - Base URL for API requests
- `REACT_APP_API_TIMEOUT` - Timeout for API requests

These environment variables allow for easy configuration of the email integration feature without code changes, making the application more adaptable to different environments and user preferences.

## Future Enhancements

Potential improvements for future versions:
- Support for more email providers with specialized parsing
- Detection of more response types (interview invitations, etc.)
- Integration with more job portals
- Email notification summarizing sync results
- Scheduled automatic sync operations
- OAuth authentication for email accounts for enhanced security
