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
const emailProcessingRoutes = require('./routes/emailProcessing_new');
const emailProcessingRoutes01 = require('./routes/emailProcessing_new01');

// Create Express app - we're reusing most of the code from server.js
const app = express();

// CORS configuration for multiple domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);

    // Log the origin for debugging purposes
    // console.log('Request origin:', origin);

    // Once all domains are identified, you can use a whitelist approach:
    const whitelist = [
      // Production deployments
      'https://job-tracking-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-git-main-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-sable.vercel.app',

      // Development branch deployments
      'https://job-tracking-dev-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-dev-git-main-michael-palmers-projects-7bed5f67.vercel.app',
      'https://job-tracking-dev-sable.vercel.app',

      // Local development
      'http://localhost:3000'
    ];

    // Check exact matches first
    if (whitelist.includes(origin)) {
      callback(null, true);
      return;
    }

    // Handle dynamic preview deployments for any branch
    // Match patterns like: https://job-tracking-xxx-vercel.app, https://job-tracking-dev-xxx-vercel.app
    const vercelPreviewRegexes = [
      /^https:\/\/job-tracking-[a-zA-Z0-9-]+-vercel\.app$/,
      /^https:\/\/job-tracking-dev-[a-zA-Z0-9-]+-vercel\.app$/,
      /^https:\/\/job-tracking-[a-zA-Z0-9-]+-michael-palmers-projects-7bed5f67\.vercel\.app$/,
      /^https:\/\/job-tracking-dev-[a-zA-Z0-9-]+-michael-palmers-projects-7bed5f67\.vercel\.app$/
    ];

    // Check if the origin matches any of our dynamic patterns
    for (const regex of vercelPreviewRegexes) {
      if (regex.test(origin)) {
        callback(null, true);
        return;
      }
    }

    // If we get here, the origin is not allowed
    console.log('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
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
    endpoints: ['/api/jobs', '/api/emails', '/api/upload', '/api/health', '/api/email-processing']
  });
});

// Use routes
app.use('/api/jobs', jobRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/emails', emailRoutes);
// app.use('/api/email-processing', emailProcessingRoutes);
app.use('/api/email-processing', emailProcessingRoutes01);

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