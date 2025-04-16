// This file serves as the main entry point for Vercel serverless functions
// It adapts your Express app to work in a serverless environment

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('../backend/config');
const jobRoutes = require('../backend/routes/jobs');
const uploadRoutes = require('../backend/routes/uploads');
const emailRoutes = require('../backend/routes/emails');

// Create Express app
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

// Connect to MongoDB (only when the function is executed)
let isConnected = false;
const connectToDatabase = async () => {
  if (isConnected) return;

  try {
    await mongoose.connect(config.database.uri);
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
};

// Serverless handler
module.exports = async (req, res) => {
  // Log request for debugging
  console.log(`[Main Handler] Handling request to ${req.url} with method ${req.method}`);

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
    return;
  }
};