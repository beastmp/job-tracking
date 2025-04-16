// Standard server.js entry point for traditional hosting environments
// This file is used when running the server directly (not in serverless mode)

const mongoose = require('mongoose');
const config = require('./config');

// Import the shared app setup from serverless-adapter
// This gives us the configured Express app with all routes
const { app } = require('./serverless-adapter');

// Connect to MongoDB - for traditional server, we connect once at startup
mongoose.connect(config.database.uri)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Define port
const PORT = config.server.port || 5000;

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});