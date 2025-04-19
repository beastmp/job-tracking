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
const emailProcessorService = require('./emailProcessorService_new01');
const webEnrichmentService = require('./webEnrichmentService_new01');
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
    type: 'email_search',
    status: 'queued',
    progress: 0,
    message: 'Search job queued',
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
      updateJob(jobId, { status: 'running', progress: 10, message: 'Starting email search' });

      // Get IMAP configuration
      updateJob(jobId, { progress: 20, message: 'Connecting to email server' });
      const { imapConfig, searchOptions, credentials } = await emailProcessorService.getImapConfig(credentialId, options);

      // Search emails
      updateJob(jobId, { progress: 30, message: 'Searching for emails' });
      const searchResults = await emailProcessorService.searchEmails(credentialId, options);

      // Update job with search results
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Found ${searchResults.applications.length} applications, ${searchResults.statusUpdates.length} status updates, and ${searchResults.responses.length} responses`,
        result: searchResults
      });
    } catch (error) {
      console.error('Email search job error:', error);
      updateJob(jobId, {
        status: 'failed',
        progress: 0,
        message: 'Search failed',
        error: error.message || 'An error occurred during email search'
      });
    }
  });

  return jobId;
};

/**
 * Start a background job to process all found items
 * @param {Object} itemData - Data with applications, status updates, and responses
 * @returns {string} Job ID for tracking progress
 */
exports.startImportJob = (itemData) => {
  const jobId = uuid();
  const { applications = [], statusUpdates = [], responses = [] } = itemData;

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'email_import',
    status: 'queued',
    progress: 0,
    message: 'Import job queued',
    data: { applications, statusUpdates, responses },
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null
  });

  // Process in the background
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, { status: 'running', progress: 10, message: 'Starting import process' });

      // Filter new applications
      updateJob(jobId, { progress: 30, message: 'Processing applications' });
      const newApplications = applications.filter(app => !app.exists);

      // Process all items
      updateJob(jobId, { progress: 50, message: 'Processing all items' });
      const stats = await emailProcessorService.processAllItems(
        newApplications,
        statusUpdates,
        responses
      );

      // Update job with import results
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Imported ${stats.applications.added} applications, processed ${stats.statusUpdates.processed} status updates and ${stats.responses.processed} responses`,
        result: { stats }
      });
    } catch (error) {
      console.error('Email import job error:', error);
      updateJob(jobId, {
        status: 'failed',
        progress: 0,
        message: 'Import failed',
        error: error.message || 'An error occurred during import'
      });
    }
  });

  return jobId;
};

/**
 * Start a background job to sync emails (search + import in one operation)
 * @param {string} credentialId - Email credential ID to use
 * @param {Object} options - Search and sync options
 * @returns {string} Job ID for tracking progress
 */
exports.startSyncJob = (credentialId, options = {}) => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'email_sync',
    status: 'queued',
    progress: 0,
    message: 'Sync job queued',
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
          message: `Queued ${stats.enrichments.queued} jobs for enrichment in the background`
        });
      }

      // Update last import time for these credentials
      await updateLastImportTime(credentialId);

      // Mark job as completed
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Sync completed - Processed ${stats.applications.added} new applications, ${stats.statusUpdates.processed} status updates, and ${stats.responses.processed} responses`,
        result: {
          ...searchResults,
          stats,
          pendingEnrichments: stats.enrichments.queued
        }
      });
    } catch (error) {
      console.error('Email sync job error:', error);
      updateJob(jobId, {
        status: 'failed',
        progress: 0,
        message: 'Sync failed',
        error: error.message || 'An error occurred during email sync'
      });
    }
  });

  return jobId;
};

/**
 * Start a background job to enrich job listings
 * @returns {string} Job ID for tracking progress
 */
exports.startEnrichmentJob = () => {
  const jobId = uuid();

  // Initialize job in memory
  jobs.set(jobId, {
    id: jobId,
    type: 'job_enrichment',
    status: 'queued',
    progress: 0,
    message: 'Enrichment job queued',
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
    error: null
  });

  // Process in the background
  setImmediate(async () => {
    try {
      // Start the job
      updateJob(jobId, { status: 'running', progress: 10, message: 'Starting enrichment process' });

      // Start the enrichment process
      await webEnrichmentService.processEnrichmentQueue();

      // Get final status
      const enrichmentStatus = webEnrichmentService.getEnrichmentStatus();

      // Mark job as completed
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Enrichment completed - Processed ${enrichmentStatus.processed} job listings`,
        result: enrichmentStatus
      });
    } catch (error) {
      console.error('Enrichment job error:', error);
      updateJob(jobId, {
        status: 'failed',
        progress: 0,
        message: 'Enrichment failed',
        error: error.message || 'An error occurred during enrichment'
      });
    }
  });

  return jobId;
};

/**
 * Get job status by ID
 * @param {string} jobId - Job ID
 * @returns {Object} Job status
 */
exports.getJobStatus = (jobId) => {
  const job = jobs.get(jobId);

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
    updates: job.updates
  };
};

/**
 * Get all active jobs
 * @returns {Array} Active jobs
 */
exports.getActiveJobs = () => {
  const activeJobs = [];

  for (const [id, job] of jobs.entries()) {
    if (job.status === 'queued' || job.status === 'running') {
      activeJobs.push({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message: job.message,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
    }
  }

  return activeJobs;
};

/**
 * Clean up completed jobs older than specified time
 * @param {number} maxAgeMs - Maximum age in milliseconds
 */
exports.cleanupOldJobs = (maxAgeMs = 24 * 60 * 60 * 1000) => {
  const now = new Date();

  for (const [id, job] of jobs.entries()) {
    // Only cleanup completed or failed jobs
    if (job.status !== 'completed' && job.status !== 'failed') {
      continue;
    }

    const jobAge = now - job.updatedAt;
    if (jobAge > maxAgeMs) {
      jobs.delete(id);
    }
  }
};

/**
 * Update a job's status and properties
 * @param {string} jobId - Job ID to update
 * @param {Object} updates - Properties to update
 */
function updateJob(jobId, updates) {
  const job = jobs.get(jobId);

  if (!job) {
    return;
  }

  // Update job properties
  Object.assign(job, {
    ...updates,
    updatedAt: new Date()
  });

  // Keep track of updates for history
  if (!job.updates) {
    job.updates = [];
  }

  if (updates.message) {
    job.updates.push({
      timestamp: new Date(),
      message: updates.message,
      progress: updates.progress
    });
  }

  // Update the job in the map
  jobs.set(jobId, job);
}

/**
 * Update the last import time for email credentials
 * @param {string} credentialId - Credential ID
 */
async function updateLastImportTime(credentialId) {
  try {
    const credentials = await EmailCredentials.findById(credentialId);
    if (credentials) {
      credentials.lastImport = new Date();
      await credentials.save();
    }
  } catch (error) {
    console.error('Error updating last import time:', error);
  }
}