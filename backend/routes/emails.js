const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');

// Search emails using saved credentials
router.post('/search-with-saved-credentials', emailController.searchEmailsWithSavedCredentials);

// Get available email folders from server
router.post('/get-folders', emailController.getAvailableFolders);

// Import selected items (applications, status updates, responses)
router.post('/import-all', emailController.importAllItems);

// Sync (search + import in one operation)
router.post('/sync', emailController.syncEmailItems);

// Credential management
router.post('/credentials', emailController.saveCredentials);
router.get('/credentials', emailController.getCredentials);
router.delete('/credentials/:id', emailController.deleteCredentials);

module.exports = router;