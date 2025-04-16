// This file serves as a dedicated endpoint for /api/jobs in Vercel
// Using Vercel's file-based routing system

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('../../backend/config');
const jobRoutes = require('../../backend/routes/jobs');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

// Use job routes without the /api/jobs prefix since Vercel adds that based on the file path
app.use('/', jobRoutes);

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
  console.log(`Handling request to ${req.url} with method ${req.method}`);

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};