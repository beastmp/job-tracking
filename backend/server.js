// Standard server.js entry point for traditional hosting environments
// This file is used when running the server directly (not in serverless mode)

const config = require('./config');
const { connectToDatabase, closeDatabase } = require('./utils/dbConnection');

// Import the shared app setup from serverless-adapter
// This gives us the configured Express app with all routes
const { app } = require('./serverless-adapter');

// Define port
const PORT = config.server.port || 5000;

// Connect to MongoDB using our connection manager
connectToDatabase()
  .then(() => {
    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    function gracefulShutdown() {
      console.log('Received shutdown signal, closing server and database connections...');
      server.close(async () => {
        console.log('HTTP server closed');
        try {
          await closeDatabase();
          console.log('All connections closed gracefully');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });

      // Force close if graceful shutdown takes too long
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    }
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });