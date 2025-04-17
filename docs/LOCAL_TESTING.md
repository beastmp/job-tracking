# Local Testing Guide

This document provides detailed instructions for setting up and running the Job Tracking application locally in both traditional server mode and serverless mode.

## Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- MongoDB (local instance, Docker, or MongoDB Atlas)
- Docker and Docker Compose (optional, for containerized MongoDB)
- Vercel CLI (for serverless mode)
- MongoDB Atlas account (optional, for cloud-based MongoDB)

## Traditional Server Mode

### Step 1: Set up the Backend

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up MongoDB (choose one option):

   **Option A: Using Docker (recommended for local development)**
   ```
   docker-compose up -d
   ```
   This will start MongoDB in a container using the configuration from `backend/docker-compose.yml`.

   **Option B: Use a locally installed MongoDB instance**

   Ensure your local MongoDB server is running on the default port 27017.

   **Option C: Using MongoDB Atlas (recommended for team collaboration)**

   a. Sign up or log in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

   b. Create a new cluster (the free tier is sufficient for development)

   c. Configure network access:
      - Go to Network Access in the security section
      - Click "Add IP Address"
      - Add your current IP address or use "Allow Access from Anywhere" for development

   d. Create a database user:
      - Go to Database Access in the security section
      - Click "Add New Database User"
      - Create a username and password with "Read and Write to Any Database" privileges

   e. Get your connection string:
      - Go to "Clusters" and click "Connect"
      - Select "Connect your application"
      - Copy the connection string (it will look like `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net`)
      - Replace `<username>` and `<password>` with the database user credentials you created

4. Create a `.env` file in the backend directory with your configuration:

   For local MongoDB:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/job-tracking
   NODE_ENV=development
   ```

   For MongoDB Atlas:
   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/job-tracking?retryWrites=true&w=majority
   NODE_ENV=development
   ```

5. Start the backend server:
   ```
   npm run dev
   ```
   This will run your server with nodemon for automatic reloading when you make changes.

   Alternatively, start it in standard mode:
   ```
   npm start
   ```

   The server will run on port 5000 by default (as specified in your server.js file).

### Step 2: Set up the Frontend

1. In a new terminal, navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the API URL pointing to your local backend:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   ```

4. Start the React development server:
   ```
   npm start
   ```

   This will typically run on port 3000 and automatically open in your browser.

## Serverless Mode

Running the application in serverless mode locally allows you to test the same architecture that will be deployed to platforms like Vercel.

### Step 1: Set up Vercel CLI

1. Install Vercel CLI globally:
   ```
   npm install -g vercel
   ```

2. Navigate to your project root:
   ```
   cd /path/to/job-tracking
   ```

3. Log in to Vercel (if not already logged in):
   ```
   vercel login
   ```

### Step 2: Run the Project in Development Mode

1. Start the Vercel development environment:
   ```
   vercel dev
   ```

   This command will:
   - Detect your Vercel configuration from `vercel.json`
   - Set up local serverless functions using your `/api` directory
   - Start a local development server, typically on port 3000

2. If running the frontend separately:

   Create a `.env.local` file in your frontend directory:
   ```
   REACT_APP_API_URL=http://localhost:3000/api
   ```

   Then start the frontend:
   ```
   cd frontend
   npm start
   ```

   Note: You may need to use a different port for the frontend if Vercel dev is using port 3000.

## Testing Both Modes

Here's how you can test both modes:

1. **Traditional Mode**:
   - Backend is running on port 5000 with `npm run dev`
   - Frontend is running on port 3000 with `npm start`
   - Frontend connects to `http://localhost:5000/api`

2. **Serverless Mode**:
   - The entire application is running through `vercel dev`
   - API endpoints are available at `http://localhost:3000/api`
   - Frontend connects to the serverless API

## Troubleshooting

### Database Connection Issues

If you encounter database connection issues:

1. **For local MongoDB with Docker:**
   ```
   docker ps
   ```
   Check MongoDB logs:
   ```
   docker logs <mongodb-container-id>
   ```

2. **For MongoDB Atlas:**
   - Verify that your IP address has been whitelisted in the Network Access settings
   - Check that your username and password are correct in the connection string
   - Make sure you've created the database user with proper permissions
   - Test the connection using MongoDB Compass or another MongoDB client

3. Verify your connection string in the `.env` file matches your MongoDB setup.

### CORS Issues

If you see CORS errors in the console:

1. Check that your backend CORS configuration in `serverless-adapter.js` includes your frontend's origin.
2. Make sure you're using the correct API URL in your frontend environment variables.

### Serverless Function Timeout

If serverless functions are timing out:

1. Check that your database connections are being managed correctly for serverless environments.
2. Increase the function timeout in your `vercel.json` configuration if needed.

## Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Connection Troubleshooting](https://docs.mongodb.com/manual/reference/connection-string/)