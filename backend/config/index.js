const dotenv = require('dotenv');
dotenv.config();

// Helper function to determine the MongoDB connection string
const getDatabaseUri = () => {
  // Check if MongoDB Atlas URI is provided
  if (process.env.MONGODB_ATLAS_URI) {
    return process.env.MONGODB_ATLAS_URI;
  }

  // Check if local MongoDB URI is provided
  if (process.env.MONGODB_LOCAL_URI) {
    return process.env.MONGODB_LOCAL_URI;
  }

  // Fall back to the generic MONGODB_URI if provided
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  // Construct a default local MongoDB URI if needed
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const database = process.env.MONGODB_DATABASE || 'job-tracking';
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;

  if (username && password) {
    return `mongodb://${username}:${password}@${host}:${port}/${database}`;
  }

  return `mongodb://${host}:${port}/${database}`;
};

module.exports = {
  server: {
    port: process.env.PORT || 5000,
    bodyLimit: process.env.API_BODY_LIMIT || '50mb',
    apiTimeout: parseInt(process.env.API_TIMEOUT || '30000', 10)
  },
  database: {
    uri: getDatabaseUri(),
    isAtlas: Boolean(process.env.MONGODB_ATLAS_URI),
    isLocal: Boolean(process.env.MONGODB_LOCAL_URI) || (!process.env.MONGODB_ATLAS_URI && !process.env.MONGODB_URI)
  },
  linkedin: {
    rateLimit: {
      requestsPerMinute: parseInt(process.env.LINKEDIN_REQUESTS_PER_MINUTE || '5', 10),
      maxConsecutiveFailures: parseInt(process.env.LINKEDIN_MAX_CONSECUTIVE_FAILURES || '3', 10),
      standardDelay: parseInt(process.env.LINKEDIN_STANDARD_DELAY || '12000', 10),
      backoffDelay: parseInt(process.env.LINKEDIN_BACKOFF_DELAY || '60000', 10),
      requestTimeout: parseInt(process.env.LINKEDIN_REQUEST_TIMEOUT || '15000', 10),
      maxRedirects: parseInt(process.env.LINKEDIN_MAX_REDIRECTS || '5', 10)
    }
  },
  email: {
    address: process.env.EMAIL_ADDRESS,
    provider: process.env.EMAIL_PROVIDER || 'Gmail',
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      useTLS: process.env.USE_TLS === 'true',
      searchTimeframeDays: parseInt(process.env.DEFAULT_SEARCH_TIMEFRAME_DAYS || '90', 10),
      searchFolders: (process.env.DEFAULT_SEARCH_FOLDERS || 'INBOX').split(','),
      importBatchSize: parseInt(process.env.EMAIL_IMPORT_BATCH_SIZE || '10', 10)
    }
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY
  },
  jobs: {
    defaults: {
      locationType: process.env.DEFAULT_LOCATION_TYPE || 'Remote',
      employmentType: process.env.DEFAULT_EMPLOYMENT_TYPE || 'Full-time',
      wageType: process.env.DEFAULT_WAGE_TYPE || 'Yearly'
    }
  },
  pagination: {
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10)
  }
};