/**
 * Email Processing Controller - API endpoints for email search and job enrichment
 *
 * This controller handles:
 * 1. Initiating email searches
 * 2. Processing discovered job applications
 * 3. Managing background jobs
 * 4. Checking job status
 */

const emailWorkerService = require('../services/emailWorkerService_new');
const webEnrichmentService = require('../services/webEnrichmentService_new');
const EmailCredentials = require('../models/EmailCredentials');

/**
 * Search emails for job data
 */
exports.searchEmails = async (req, res) => {
  try {
    const { credentialId, options = {} } = req.body;

    if (!credentialId) {
      return res.status(400).json({ message: 'Credential ID is required' });
    }

    // Start a background job for the search
    const jobId = emailWorkerService.startEmailSearchJob(credentialId, options);

    return res.status(202).json({
      message: 'Email search started',
      jobId,
    });
  } catch (error) {
    console.error('Error starting email search:', error);
    return res.status(500).json({ message: 'Error starting email search', error: error.message });
  }
};

/**
 * Process items from emails (applications, status updates, responses)
 */
exports.processItems = async (req, res) => {
  try {
    const { applications = [], statusUpdates = [], responses = [], options = {} } = req.body;

    if (applications.length === 0 && statusUpdates.length === 0 && responses.length === 0) {
      return res.status(400).json({ message: 'No items to process' });
    }

    // Start a background job for processing
    const jobId = emailWorkerService.startItemsProcessingJob(applications, statusUpdates, responses, options);

    return res.status(202).json({
      message: 'Processing started',
      jobId,
    });
  } catch (error) {
    console.error('Error processing items:', error);
    return res.status(500).json({ message: 'Error processing items', error: error.message });
  }
};

/**
 * Sync emails - search and process in one operation
 */
exports.syncEmails = async (req, res) => {
  try {
    const { credentialId, options = {} } = req.body;

    if (!credentialId) {
      return res.status(400).json({ message: 'Credential ID is required' });
    }

    // Start a background job for the sync
    const jobId = emailWorkerService.startSyncJob(credentialId, options);

    return res.status(202).json({
      message: 'Email sync started',
      jobId,
    });
  } catch (error) {
    console.error('Error syncing emails:', error);
    return res.status(500).json({ message: 'Error syncing emails', error: error.message });
  }
};

/**
 * Start web enrichment processing
 */
exports.runEnrichment = async (req, res) => {
  try {
    // Start a background job for enrichment
    const jobId = emailWorkerService.startEnrichmentJob();

    return res.status(202).json({
      message: 'Enrichment processing started',
      jobId,
    });
  } catch (error) {
    console.error('Error starting enrichment:', error);
    return res.status(500).json({ message: 'Error starting enrichment', error: error.message });
  }
};

/**
 * Enrich a specific job by URL
 */
exports.enrichJobUrl = async (req, res) => {
  try {
    const { url, jobId } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    // Queue the job for enrichment
    await webEnrichmentService.queueJobForEnrichment(url, {});

    // If a jobId is provided, store it for updating after enrichment
    if (jobId) {
      await webEnrichmentService.storeJobIdForEnrichment(url, jobId);
    }

    // Start the enrichment process
    emailWorkerService.startEnrichmentJob();

    return res.status(202).json({
      message: 'Job queued for enrichment',
      url,
    });
  } catch (error) {
    console.error('Error queuing job for enrichment:', error);
    return res.status(500).json({ message: 'Error queuing job for enrichment', error: error.message });
  }
};

/**
 * Get job status
 */
exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ message: 'Job ID is required' });
    }

    const jobStatus = emailWorkerService.getJobStatus(jobId);

    if (!jobStatus) {
      return res.status(404).json({ message: 'Job not found' });
    }

    return res.status(200).json(jobStatus);
  } catch (error) {
    console.error('Error getting job status:', error);
    return res.status(500).json({ message: 'Error getting job status', error: error.message });
  }
};

/**
 * Get active jobs
 */
exports.getActiveJobs = async (req, res) => {
  try {
    const activeJobs = emailWorkerService.getActiveJobs();
    return res.status(200).json(activeJobs);
  } catch (error) {
    console.error('Error getting active jobs:', error);
    return res.status(500).json({ message: 'Error getting active jobs', error: error.message });
  }
};

/**
 * Extract job data directly from a URL
 */
exports.extractFromUrl = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const extractedData = await webEnrichmentService.extractJobData(url);

    if (!extractedData) {
      return res.status(400).json({ message: 'Could not extract job data from the provided URL' });
    }

    return res.status(200).json({
      message: 'Job data extracted successfully',
      data: extractedData
    });
  } catch (error) {
    console.error('Error extracting job data:', error);
    return res.status(500).json({ message: 'Error extracting job data', error: error.message });
  }
};