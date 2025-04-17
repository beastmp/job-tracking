// Create a MongoDB connection manager for consistent connection handling
const mongoose = require('mongoose');
const config = require('../config');

// Default MongoDB connection options optimized for performance and reliability
const defaultMongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Limit total concurrent connections
  minPoolSize: 2, // Keep at least 2 connections in the pool
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  connectTimeoutMS: 10000, // Connection timeout after 10 seconds
  serverSelectionTimeoutMS: 5000, // Timeout server selection after 5 seconds
};

// Store the connection instance for reuse
let dbConnection = null;

/**
 * Connect to MongoDB with connection pooling and reuse
 * This function can be called multiple times and will reuse the existing connection
 */
const connectToDatabase = async () => {
  // If we already have a connection and it's ready, use it
  if (dbConnection && mongoose.connection.readyState === 1) {
    return dbConnection;
  }

  // If connection is in progress, wait for it
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve) => {
      mongoose.connection.once('connected', () => {
        resolve(mongoose.connection);
      });
    });
  }

  // Close any existing broken connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  try {
    // Create new connection with pooling options
    console.log('Establishing new MongoDB connection with connection pooling...');
    dbConnection = await mongoose.connect(config.database.uri, defaultMongoOptions);

    // Add connection monitoring for debugging
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected. Will reconnect if needed.');
      dbConnection = null;
    });

    console.log(`Connected to MongoDB (poolSize=${defaultMongoOptions.maxPoolSize})`);
    return dbConnection;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    dbConnection = null;
    throw err;
  }
};

/**
 * Gracefully close the MongoDB connection
 * Call this when shutting down the server
 */
const closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    console.log('Closing MongoDB connection...');
    await mongoose.connection.close();
    dbConnection = null;
    console.log('MongoDB connection closed');
  }
};

// Export the connection functions
module.exports = {
  connectToDatabase,
  closeDatabase,
  getConnection: () => dbConnection,
};