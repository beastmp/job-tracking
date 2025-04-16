// This file serves as a universal serverless adapter
// It can be imported by platform-specific entry points

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const jobRoutes = require('./routes/jobs');
const uploadRoutes = require('./routes/uploads');
const emailRoutes = require('./routes/emails');

// Create Express app - we're reusing most of the code from server.js
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    config: {
      apiUrl: process.env.REACT_APP_API_URL || 'Not set',
      mongoDbConnected: mongoose.connection.readyState === 1
    }
  });
});

// Root endpoint for API
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Job Tracking API is running',
    version: '1.0.0',
    endpoints: ['/api/jobs', '/api/emails', '/api/upload', '/api/health']
  });
});

// Use routes
app.use('/api/jobs', jobRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/emails', emailRoutes);

// Optimize MongoDB connection for serverless
// Store connection in global variable to reuse across function invocations
let dbConnection = null;
const connectToDatabase = async () => {
  // If we already have a connection, use it
  if (dbConnection && mongoose.connection.readyState === 1) {
    return dbConnection;
  }

  // Configure connection options for better performance in serverless
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    bufferCommands: false, // Disable mongoose buffering
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    maxPoolSize: 10, // Keep up to 10 connections open
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  };

  try {
    // Create new connection
    dbConnection = await mongoose.connect(config.database.uri, options);
    console.log('Connected to MongoDB');
    return dbConnection;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
};

// Generic serverless handler
const serverlessHandler = async (req, res) => {
  // Add timestamp for performance tracking
  const startTime = Date.now();

  try {
    // Connect to database (will reuse connection if it exists)
    await connectToDatabase();

    // Log performance data
    console.log(`Database connection time: ${Date.now() - startTime}ms`);

    // Process request
    return app(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
    return;
  } finally {
    // Log overall function execution time
    console.log(`Total function execution time: ${Date.now() - startTime}ms`);
  }
};

// Export both the Express app and the serverless handler
module.exports = serverlessHandler;
module.exports.app = app;