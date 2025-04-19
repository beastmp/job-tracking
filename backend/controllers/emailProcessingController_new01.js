/**
 * Email Processing Controller - API endpoints for email search and job enrichment
 *
 * This controller handles:
 * 1. Initiating email searches
 * 2. Processing discovered job applications
 * 3. Managing background jobs
 * 4. Checking job status
 */
const emailWorkerService = require('../services/emailWorkerService_new01');
const webEnrichmentService = require('../services/webEnrichmentService_new01');
const EmailCredentials = require('../models/EmailCredentials');

/**
 * Search emails for job data
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
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
      jobId
    });
  } catch (error) {
    console.error('Error starting email search:', error);
    return res.status(500).json({
      message: 'Error starting email search',
      error: error.message
    });
  }
};

/**
 * Process and import found items
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.importItems = async (req, res) => {
  try {
    const { applications = [], statusUpdates = [], responses = [] } = req.body;

    // Start a background job for the import
    const jobId = emailWorkerService.startImportJob({
      applications,
      statusUpdates,
      responses
    });

    return res.status(202).json({
      message: 'Import process started',
      jobId
    });
  } catch (error) {
    console.error('Error importing items:', error);
    return res.status(500).json({
      message: 'Error importing items',
      error: error.message
    });
  }
};

/**
 * Sync emails (search + import in one operation)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
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
      jobId
    });
  } catch (error) {
    console.error('Error syncing emails:', error);
    return res.status(500).json({
      message: 'Error syncing emails',
      error: error.message
    });
  }
};

/**
 * Start web enrichment processing
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.runEnrichment = async (req, res) => {
  try {
    // Start a background job for enrichment
    const jobId = emailWorkerService.startEnrichmentJob();

    return res.status(202).json({
      message: 'Enrichment processing started',
      jobId
    });
  } catch (error) {
    console.error('Error starting enrichment:', error);
    return res.status(500).json({
      message: 'Error starting enrichment',
      error: error.message
    });
  }
};

/**
 * Enrich a specific URL
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.enrichUrl = async (req, res) => {
  try {
    const { url, type = 'generic' } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const enrichedData = await webEnrichmentService.enrichUrl(url, type);

    return res.status(200).json({
      success: true,
      data: enrichedData
    });
  } catch (error) {
    console.error('Error enriching URL:', error);
    return res.status(500).json({
      message: 'Error enriching URL',
      error: error.message
    });
  }
};

/**
 * Get job status by ID
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ message: 'Job ID is required' });
    }

    const job = emailWorkerService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    return res.status(200).json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return res.status(500).json({
      message: 'Error getting job status',
      error: error.message
    });
  }
};

/**
 * Get all active jobs
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.getActiveJobs = async (req, res) => {
  try {
    const activeJobs = emailWorkerService.getActiveJobs();

    return res.status(200).json(activeJobs);
  } catch (error) {
    console.error('Error getting active jobs:', error);
    return res.status(500).json({
      message: 'Error getting active jobs',
      error: error.message
    });
  }
};

/**
 * Get enrichment status
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
exports.getEnrichmentStatus = async (req, res) => {
  try {
    const status = webEnrichmentService.getEnrichmentStatus();

    return res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting enrichment status:', error);
    return res.status(500).json({
      message: 'Error getting enrichment status',
      error: error.message
    });
  }
};