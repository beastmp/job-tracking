const express = require('express');
const { body } = require('express-validator');
const emailController = require('../controllers/emailController');
const router = express.Router();

// Get all email credentials
router.get('/credentials', emailController.getCredentials);

// Save email credentials
router.post('/credentials',
  [
    body('email').isEmail().withMessage('Valid email address is required'),
    body('imapHost').notEmpty().withMessage('IMAP host is required'),
    body('imapPort').notEmpty().withMessage('IMAP port is required'),
    // Password is not required for updates (only for new credentials)
  ],
  emailController.saveCredentials
);

// Delete email credentials
router.delete('/credentials/:id', emailController.deleteCredentials);

// Get available folders for an email account
router.post('/get-folders',
  [
    body('credentialId').notEmpty().withMessage('Credential ID is required'),
  ],
  emailController.getAvailableFolders
);

// Sync: search and import emails in one operation
router.post('/sync',
  [
    body('credentialId').notEmpty().withMessage('Credential ID is required'),
  ],
  emailController.syncEmailItems
);

// NEW: Start async sync - returns job ID immediately
router.post('/sync-background',
  [
    body('credentialId').notEmpty().withMessage('Credential ID is required'),
  ],
  emailController.startBackgroundSync
);

// NEW: Start async email search - returns job ID immediately
router.post('/search-background',
  [
    body('credentialId').notEmpty().withMessage('Credential ID is required'),
  ],
  emailController.startBackgroundEmailSearch
);

// NEW: Import items using background job
router.post('/import-background',
  [
    body('applications').optional().isArray(),
    body('statusUpdates').optional().isArray(),
    body('responses').optional().isArray(),
  ],
  emailController.importItemsFromJob
);

// NEW: Get job status by ID
router.get('/job/:jobId', emailController.getJobStatus);

// Import items that were previously found during search
router.post('/import-all',
  [
    body('applications').optional().isArray(),
    body('statusUpdates').optional().isArray(),
    body('responses').optional().isArray(),
  ],
  emailController.importAllItems
);

// Get status of LinkedIn job enrichment processing
router.get('/enrichment-status', emailController.getEnrichmentStatus);

module.exports = router;