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
  await connectToDatabase();

  // Handle the request with your Express app
  return app(req, res);
};