// This file serves as a dedicated endpoint for /api/jobs/stats in Vercel
// Using Vercel's file-based routing system

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('../../../backend/config');
const jobController = require('../../../backend/controllers/jobController');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

// Direct route for stats endpoint
app.get('/', jobController.getApplicationStats);

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
  console.log(`[Stats Handler] Handling request to /api/jobs/stats with method ${req.method}`);

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Error handling stats request:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};