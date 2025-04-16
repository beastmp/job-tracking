const EmailCredentials = require('../models/EmailCredentials');
const emailService = require('../services/emailService');

// Search emails using saved credentials
exports.searchEmailsWithSavedCredentials = async (req, res) => {
  try {
    const { credentialId, ignorePreviousImport = false } = req.body;

    // Use the service to search emails
    const results = await emailService.searchEmails(credentialId, {
      ignorePreviousImport,
      ...req.body
    });

    // Return results
    res.status(200).json({
      success: true,
      message: `Found ${results.applications.length} job applications, ${results.statusUpdates.length} status updates, and ${results.responses.length} responses in your emails`,
      ...results
    });
  } catch (error) {
    handleApiError(error, res, 'Error searching emails');
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

// Reusable error handler for API responses
function handleApiError(error, res, defaultMessage) {
  console.error(`${defaultMessage}:`, error);
  res.status(500).json({
    success: false,
    message: error.message || defaultMessage
  });
}