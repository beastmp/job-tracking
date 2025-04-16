# Security and Setup Guide

## Overview

This document provides instructions for securely setting up and deploying the Job Tracking Application. Following these guidelines will help ensure that your deployment is secure and that sensitive information is properly protected.

## Environment Variables Configuration

The application uses environment variables for configuration. **Never commit real credentials to your repository.**

### Required Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/?retryWrites=true&w=majority&appName=appname
EMAIL_ADDRESS=example@gmail.com
EMAIL_PROVIDER=Gmail
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
USE_TLS=true
ENCRYPTION_KEY=your_32_character_random_encryption_key
```

### Generating a Secure Encryption Key

For the `ENCRYPTION_KEY`, generate a secure random 32-character string. You can use the following command:

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Store this key securely and never share it publicly.

## MongoDB Security

1. **Use Strong Credentials**: Create a dedicated MongoDB user with a strong password.
2. **IP Whitelisting**: Restrict access to your MongoDB instance by IP address.
3. **Enable Authentication**: Ensure MongoDB authentication is enabled.
4. **Regular Backups**: Set up regular backups of your database.

## Email Integration Security

The application stores encrypted email credentials for auto-importing job applications from email. Consider the following security measures:

1. **App-Specific Passwords**: If using Gmail, create an app-specific password instead of using your main account password.
2. **Dedicated Email Account**: Consider creating a dedicated email account for job applications.
3. **TLS Encryption**: Always use TLS for email connections (`USE_TLS=true`).

## LinkedIn Integration Security

1. **API Compliance**: Ensure your use of LinkedIn data complies with LinkedIn's Terms of Service.
2. **Rate Limiting**: Implement rate limiting to avoid being flagged by LinkedIn.
3. **Secure Storage**: Properly secure the LinkedIn API credentials.

## Production Deployment Recommendations

### HTTPS

Always use HTTPS in production. You can set up a free SSL certificate using Let's Encrypt.

### Reverse Proxy

Use a reverse proxy like Nginx to handle SSL termination and to proxy requests to your application.

### Monitoring and Logging

Implement monitoring and logging to detect and respond to security incidents.

## Regular Security Maintenance

1. **Dependency Updates**: Regularly update dependencies to address security vulnerabilities.
2. **Security Audits**: Periodically audit your application's security.
3. **Encryption Key Rotation**: Consider rotating encryption keys periodically.

## Docker Deployment (Optional)

If using Docker, ensure that sensitive information is passed via environment variables and not baked into the Docker image.

```dockerfile
# Example docker-compose.yml snippet
version: '3'
services:
  backend:
    build: ./backend
    environment:
      - MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    # other configuration...
```

## Security Best Practices for Users

Advise your users to:

1. Use strong, unique passwords
2. Enable two-factor authentication where available
3. Review the User Agreement and Privacy Policy
4. Report any security concerns promptly

## Troubleshooting

If you encounter security-related issues, check:

1. Proper environment variable configuration
2. Database connection security
3. Encryption key configuration
4. TLS/SSL certificate validity