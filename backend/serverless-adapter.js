// This file serves as a universal serverless adapter
// It can be imported by platform-specific entry points

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const { connectToDatabase } = require('./utils/dbConnection');
const jobRoutes = require('./routes/jobs');
const uploadRoutes = require('./routes/uploads');
const emailRoutes = require('./routes/emails');

// Create Express app - we're reusing most of the code from server.js
const app = express();

// CORS configuration for multiple domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);

    // Log the origin for debugging purposes
    console.log('Request origin:', origin);

    // For now, allow all origins while we identify all domains
    // callback(null, true);

    // Once all domains are identified, you can use a whitelist approach:
    const whitelist = [
      'https://job-tracking-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-git-main-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-sable.vercel.app',
      'http://localhost:3000'
    ];

    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }

  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
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

// Generic serverless handler
const serverlessHandler = async (req, res) => {
  // Add timestamp for performance tracking
  const startTime = Date.now();

  try {
    // Connect to database using our connection manager (will reuse connection if it exists)
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

    // Note: we don't close the connection here as it's reused between serverless invocations
    // The cloud provider will handle connection cleanup when the instance is recycled
  }
};

// Export both the Express app and the serverless handler
module.exports = serverlessHandler;
module.exports.app = app;