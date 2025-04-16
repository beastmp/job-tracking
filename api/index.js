// This is a platform adapter for Vercel
// It takes your Express app and adapts it to Vercel's serverless functions

// Import the actual Express app
const serverlessAdapter = require('./backend/serverless-adapter');

// Export the handler for Vercel
module.exports = serverlessAdapter;