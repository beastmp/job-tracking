const EmailCredentials = require('../models/EmailCredentials');
const emailService = require('../services/emailService');
const jobQueue = require('../utils/jobQueue');

// Search emails using saved credentials
exports.searchEmailsWithSavedCredentials = async (req, res) => {
  try {
    const { credentialId, ignorePreviousImport = false } = req.body;

    // Set timeout headers to prevent Vercel from terminating the connection prematurely
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/json');

    // Get the search configuration to determine total workload
    const { searchOptions } = await emailService.getImapConfig(credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    // Start with an empty response structure
    const results = {
      applications: [],
      statusUpdates: [],
      responses: [],
      stats: {
        total: 0,
        new: 0,
        existing: 0
      },
      processingStats: {
        emailsTotal: 0,
        emailsProcessed: 0,
        foldersTotal: searchOptions.searchFolders.length,
        foldersProcessed: 0,
        enrichmentTotal: 0,
        enrichmentProcessed: 0
      }
    };

    // Use the chunked search approach with progress updates
    const searchResults = await emailService.searchEmailsChunked(credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    // Return the complete results
    res.status(200).json({
      success: true,
      message: `Found ${searchResults.applications.length} job applications, ${searchResults.statusUpdates.length} status updates, and ${searchResults.responses.length} responses in your emails`,
      ...searchResults
    });
  } catch (error) {
    handleApiError(error, res, 'Error searching emails');
  }
};

// Start searching emails in background with job tracking
exports.startBackgroundEmailSearch = async (req, res) => {
  try {
    const { credentialId, ignorePreviousImport = false } = req.body;

    // Create a new background job
    const jobId = jobQueue.createJob('email_search', {
      credentialId,
      ignorePreviousImport,
      ...req.body
    });

    // Start the search process in the background
    emailService.startBackgroundEmailSearch(jobId, credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    // Immediately return the job ID for tracking
    res.status(202).json({
      success: true,
      message: 'Email search started in the background',
      jobId,
      job: jobQueue.getJob(jobId)
    });
  } catch (error) {
    handleApiError(error, res, 'Error starting background email search');
  }
};

// Import items from background job
exports.importItemsFromJob = async (req, res) => {
  try {
    const { jobId, applications = [], statusUpdates = [], responses = [] } = req.body;

    // Create a new job for the import process
    const importJobId = jobQueue.createJob('email_import', {
      parentJobId: jobId,
      items: {
        applicationsCount: applications.length,
        statusUpdatesCount: statusUpdates.length,
        responsesCount: responses.length
      }
    });

    // Start the import process in background
    emailService.importItemsAsJob(importJobId, applications, statusUpdates, responses);

    res.status(202).json({
      success: true,
      message: 'Import process started in the background',
      jobId: importJobId,
      job: jobQueue.getJob(importJobId)
    });
  } catch (error) {
    handleApiError(error, res, 'Error starting background import');
  }
};

// Get job status
exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.status(200).json({
      success: true,
      job
    });
  } catch (error) {
    handleApiError(error, res, 'Error getting job status');
  }
};

// Get available email folders
exports.getAvailableFolders = async (req, res) => {
  try {
    const { credentialId } = req.body;
    const folders = await emailService.getAvailableFolders(credentialId);

    res.status(200).json({
      success: true,
      message: 'Retrieved email folders successfully',
      folders
    });
  } catch (error) {
    handleApiError(error, res, 'Error getting email folders');
  }
};

// Import selected items (applications, status updates, responses)
exports.importAllItems = async (req, res) => {
  try {
    const { applications = [], statusUpdates = [], responses = [] } = req.body;
    const stats = await emailService.importItems(applications, statusUpdates, responses);

    res.status(200).json({
      success: true,
      message: `Successfully imported ${stats.applications.added} new job applications, processed ${stats.statusUpdates.processed} status updates, and ${stats.responses.processed} job responses`,
      stats
    });
  } catch (error) {
    handleApiError(error, res, 'Error importing email items');
  }
};

// Sync (search + import in one operation)
exports.syncEmailItems = async (req, res) => {
  try {
    const { credentialId, ignorePreviousImport = false } = req.body;

    const result = await emailService.syncEmails(credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    res.status(200).json({
      success: true,
      message: `Successfully synced ${result.stats.applications.added} new job applications, processed ${result.stats.statusUpdates.processed} status updates, and ${result.stats.responses.processed} job responses`,
      ...result
    });
  } catch (error) {
    handleApiError(error, res, 'Error syncing email items');
  }
};

// Start sync in background with job tracking
exports.startBackgroundSync = async (req, res) => {
  try {
    const { credentialId, ignorePreviousImport = false } = req.body;

    // Create a new job for the sync process
    const jobId = jobQueue.createJob('email_sync', {
      credentialId,
      ignorePreviousImport,
      ...req.body
    });

    // Start the sync process in the background
    emailService.syncEmailsAsJob(jobId, credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    res.status(202).json({
      success: true,
      message: 'Email sync started in the background',
      jobId,
      job: jobQueue.getJob(jobId)
    });
  } catch (error) {
    handleApiError(error, res, 'Error starting background email sync');
  }
};

// Save email credentials
exports.saveCredentials = async (req, res) => {
  try {
    const credentialData = req.body;
    const savedCredentials = await emailService.saveCredentials(credentialData);

    res.status(200).json({
      success: true,
      message: 'Email credentials saved successfully',
      credentials: savedCredentials
    });
  } catch (error) {
    handleApiError(error, res, 'Error saving email credentials');
  }
};

// Get stored email credentials
exports.getCredentials = async (req, res) => {
  try {
    const credentials = await emailService.getAllCredentials();

    res.status(200).json({
      success: true,
      message: 'Email credentials retrieved successfully',
      credentials
    });
  } catch (error) {
    handleApiError(error, res, 'Error getting email credentials');
  }
};

// Delete email credentials
exports.deleteCredentials = async (req, res) => {
  try {
    const { id } = req.params;
    await emailService.deleteCredentials(id);

    res.status(200).json({
      success: true,
      message: 'Email credentials deleted successfully'
    });
  } catch (error) {
    handleApiError(error, res, 'Error deleting email credentials');
  }
};

// Add this new function to get the enrichment status
/**
 * Get status of LinkedIn job enrichment processing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.getEnrichmentStatus = async (req, res) => {
  try {
    const linkedInEnrichmentService = require('../services/linkedInEnrichmentService');
    const status = linkedInEnrichmentService.getEnrichmentStatus();

    return res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting enrichment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get enrichment status'
    });
  }
};

// Reusable error handler for API responses
function handleApiError(error, res, defaultMessage) {
  console.error(`${defaultMessage}:`, error);
  res.status(500).json({
    success: false,
    message: error.message || defaultMessage
  });
}