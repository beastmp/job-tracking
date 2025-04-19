/**
 * Email Processing Routes - API endpoints for email integration
 *
 * These routes handle:
 * - Email searching via IMAP
 * - Processing found job applications
 * - Enriching job data from web sources
 * - Background job management
 */
const express = require('express');
const { body } = require('express-validator');
const emailProcessingController = require('../controllers/emailProcessingController_new01');
const router = express.Router();

// Search emails for job-related content
router.post('/search', [
  body('credentialId').notEmpty().withMessage('Credential ID is required')
], emailProcessingController.searchEmails);

// Import found items
router.post('/import', [
  body('applications').optional().isArray(),
  body('statusUpdates').optional().isArray(),
  body('responses').optional().isArray()
], emailProcessingController.importItems);

// Sync emails (search + import in one operation)
router.post('/sync', [
  body('credentialId').notEmpty().withMessage('Credential ID is required')
], emailProcessingController.syncEmails);

// Start enrichment of job listings
router.post('/enrichment', emailProcessingController.runEnrichment);

// Enrich a specific URL
router.post('/enrich-url', [
  body('url').notEmpty().withMessage('URL is required')
], emailProcessingController.enrichUrl);

// Get job status
router.get('/job/:jobId', emailProcessingController.getJobStatus);

// Get all active jobs
router.get('/active-jobs', emailProcessingController.getActiveJobs);

// Get enrichment status
router.get('/enrichment-status', emailProcessingController.getEnrichmentStatus);

module.exports = router;