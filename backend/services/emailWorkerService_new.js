/**
 * Email Worker Service - Handles background processing of email searches and job enrichment
 *
 * This service is designed to:
 * 1. Run email searches and processing in the background to avoid timeouts
 * 2. Handle long-running tasks like web enrichment
 * 3. Provide status updates on background jobs
 * 4. Support both traditional and serverless environments
 */
const { v4: uuid } = require('uuid');
const emailProcessorService = require('./emailProcessorService_new');
const webEnrichmentService = require('./webEnrichmentService_new');
const EmailCredentials = require('../models/EmailCredentials');

// In-memory job storage for development
// In production, this should be replaced with a persistent store like MongoDB or Redis
const jobs = new Map();

/**
 * Start a background job to search emails
 * @param {string} credentialId - Email credential ID to use
 * @param {Object} options - Search options
 * @returns {string} Job ID for tracking progress
 */
exports.startEmailSearchJob = (credentialId, options = {}) => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'emailSearch',
    status: 'queued',
    progress: 0,
    message: 'Job queued',
    data: { credentialId, options },
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null
  });

  // Process in the background without blocking
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, { status: 'running', progress: 5, message: 'Starting email search' });

      // Run the actual search
      const results = await emailProcessorService.searchEmails(credentialId, options);

      // Update job with search results
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Found ${results.applications.length} applications, ${results.statusUpdates.length} status updates, and ${results.responses.length} responses`,
        result: results
      });

      // If specified in options, automatically process the results
      if (options.autoProcess) {
        exports.startItemsProcessingJob(
          results.applications.filter(app => !app.exists),
          results.statusUpdates,
          results.responses,
          { parentJobId: jobId }
        );
      }
    } catch (error) {
      console.error('Error in email search job:', error);
      updateJob(jobId, {
        status: 'failed',
        message: `Job failed: ${error.message}`,
        error: error.message
      });
    }
  });

  return jobId;
};

/**
 * Start a background job to process email items (applications, status updates, responses)
 * @param {Array} applications - Applications to process
 * @param {Array} statusUpdates - Status updates to process
 * @param {Array} responses - Responses to process
 * @param {Object} options - Additional options
 * @returns {string} Job ID for tracking progress
 */
exports.startItemsProcessingJob = (applications = [], statusUpdates = [], responses = [], options = {}) => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'itemsProcessing',
    status: 'queued',
    progress: 0,
    message: 'Job queued',
    data: { applications, statusUpdates, responses, options },
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null,
    parentJobId: options.parentJobId
  });

  // Process in the background
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, {
        status: 'running',
        progress: 5,
        message: `Processing ${applications.length} applications, ${statusUpdates.length} status updates, and ${responses.length} responses`
      });

      // Process the items
      const stats = await emailProcessorService.processAllItems(applications, statusUpdates, responses);

      // Start the enrichment process if there were applications with URLs
      if (stats.enrichments.queued > 0) {
        updateJob(jobId, {
          progress: 75,
          message: `Processing ${stats.enrichments.queued} web enrichments...`
        });

        // Process the enrichment queue
        await webEnrichmentService.processEnrichmentQueue();
      }

      // Complete the job
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Processed ${stats.applications.added} applications, ${stats.statusUpdates.processed} status updates, and ${stats.responses.processed} responses`,
        result: stats
      });
    } catch (error) {
      console.error('Error in items processing job:', error);
      updateJob(jobId, {
        status: 'failed',
        message: `Job failed: ${error.message}`,
        error: error.message
      });
    }
  });

  return jobId;
};

/**
 * Start a combined job that searches emails and processes the results
 * @param {string} credentialId - Email credential ID to use
 * @param {Object} options - Search and processing options
 * @returns {string} Job ID for tracking progress
 */
exports.startSyncJob = (credentialId, options = {}) => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'sync',
    status: 'queued',
    progress: 0,
    message: 'Job queued',
    data: { credentialId, options },
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null
  });

  // Process in the background
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, { status: 'running', progress: 5, message: 'Starting email sync' });

      // Get IMAP configuration
      updateJob(jobId, { progress: 10, message: 'Connecting to email server' });
      const { imapConfig, searchOptions, credentials } = await emailProcessorService.getImapConfig(credentialId, options);

      // Search emails
      updateJob(jobId, { progress: 20, message: 'Searching for emails' });
      const searchResults = await emailProcessorService.searchEmails(credentialId, options);

      // Update job with search results
      updateJob(jobId, {
        progress: 50,
        message: `Found ${searchResults.applications.length} applications, ${searchResults.statusUpdates.length} status updates, and ${searchResults.responses.length} responses`
      });

      // Process the items
      updateJob(jobId, { progress: 60, message: 'Processing found items' });
      const stats = await emailProcessorService.processAllItems(
        searchResults.applications.filter(app => !app.exists),
        searchResults.statusUpdates,
        searchResults.responses
      );

      // Start the enrichment process if there were applications with URLs
      if (stats.enrichments.queued > 0) {
        updateJob(jobId, {
          progress: 80,
          message: `Processing ${stats.enrichments.queued} web enrichments...`
        });

        // Process the enrichment queue
        await webEnrichmentService.processEnrichmentQueue();
      }

      // Update last import time
      try {
        credentials.lastImport = new Date();
        await credentials.save();
      } catch (error) {
        console.error('Error updating last import time:', error);
      }

      // Complete the job
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Processed ${stats.applications.added} applications, ${stats.statusUpdates.processed} status updates, and ${stats.responses.processed} responses`,
        result: {
          search: searchResults,
          processing: stats
        }
      });
    } catch (error) {
      console.error('Error in sync job:', error);
      updateJob(jobId, {
        status: 'failed',
        message: `Job failed: ${error.message}`,
        error: error.message
      });
    }
  });

  return jobId;
};

/**
 * Start a job to process just the enrichment queue
 * @returns {string} Job ID for tracking progress
 */
exports.startEnrichmentJob = () => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'enrichment',
    status: 'queued',
    progress: 0,
    message: 'Job queued',
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null
  });

  // Process in the background
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, { status: 'running', progress: 10, message: 'Starting web enrichment process' });

      // Process the enrichment queue
      const result = await webEnrichmentService.processEnrichmentQueue();

      // Complete the job
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Processed ${result.processed} enrichment items`,
        result
      });
    } catch (error) {
      console.error('Error in enrichment job:', error);
      updateJob(jobId, {
        status: 'failed',
        message: `Job failed: ${error.message}`,
        error: error.message
      });
    }
  });

  return jobId;
};

/**
 * Get the current status of a job
 * @param {string} jobId - The ID of the job to check
 * @returns {Object|null} Job status or null if not found
 */
exports.getJobStatus = (jobId) => {
  if (!jobs.has(jobId)) return null;
  return { ...jobs.get(jobId) };
};

/**
 * Get all running jobs
 * @returns {Array} List of active jobs
 */
exports.getActiveJobs = () => {
  const activeJobs = [];
  jobs.forEach(job => {
    if (job.status === 'queued' || job.status === 'running') {
      activeJobs.push({ ...job });
    }
  });
  return activeJobs;
};

/**
 * Update a job's status
 * @param {string} jobId - The ID of the job to update
 * @param {Object} updates - Properties to update
 * @returns {boolean} Success status
 */
function updateJob(jobId, updates) {
  if (!jobs.has(jobId)) return false;

  const job = jobs.get(jobId);
  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date()
  };

  jobs.set(jobId, updatedJob);
  return true;
}

/**
 * Clean up completed jobs that are older than the specified time
 * @param {number} olderThanMs - Milliseconds since job completion to consider for cleanup
 */
exports.cleanupOldJobs = (olderThanMs = 3600000) => { // Default: 1 hour
  const now = Date.now();

  jobs.forEach((job, jobId) => {
    // Only clean up completed or failed jobs
    if (job.status === 'completed' || job.status === 'failed') {
      const jobAge = now - job.updatedAt.getTime();
      if (jobAge > olderThanMs) {
        jobs.delete(jobId);
      }
    }
  });
};

// Set up a periodic cleanup process
setInterval(() => {
  exports.cleanupOldJobs();
}, 3600000); // Cleanup every hour