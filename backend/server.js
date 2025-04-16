const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

// Import routes
const jobRoutes = require('./routes/jobs');
const uploadRoutes = require('./routes/uploads');
const emailRoutes = require('./routes/emails');

// Use routes
app.use('/api/jobs', jobRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/emails', emailRoutes);

// Connect to MongoDB
mongoose.connect(config.database.uri)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Define port
const PORT = config.server.port;

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});