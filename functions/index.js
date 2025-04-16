// Firebase Cloud Functions entry point
const functions = require('firebase-functions');
const serverlessAdapter = require('./backend/serverless-adapter');
const express = require('express');

// Create an Express app instance specifically for Firebase
const app = express();

// Mount the Express app from our serverless adapter at the root path
app.use('/', (req, res) => {
  return serverlessAdapter(req, res);
});

// Export the function for Firebase
exports.api = functions
  .runWith({
    // Configure memory and timeout as needed
    memory: '1GB',
    timeoutSeconds: 300
  })
  .https.onRequest(app);