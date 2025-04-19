/**
 * Email Processing Routes - Routes for email search and job enrichment
 */
const express = require('express');
const router = express.Router();
const emailProcessingController = require('../controllers/emailProcessingController_new');

/**
 * @route   POST /api/email-processing/search
 * @desc    Search emails for job applications
 * @access  Private
 */
router.post('/search', emailProcessingController.searchEmails);

/**
 * @route   POST /api/email-processing/process
 * @desc    Process items found in emails
 * @access  Private
 */
router.post('/process', emailProcessingController.processItems);

/**
 * @route   POST /api/email-processing/sync
 * @desc    Search emails and process found items in one operation
 * @access  Private
 */
router.post('/sync', emailProcessingController.syncEmails);

/**
 * @route   POST /api/email-processing/enrichment
 * @desc    Start web enrichment process
 * @access  Private
 */
router.post('/enrichment', emailProcessingController.runEnrichment);

/**
 * @route   POST /api/email-processing/enrich-url
 * @desc    Enrich a job by URL
 * @access  Private
 */
router.post('/enrich-url', emailProcessingController.enrichJobUrl);

/**
 * @route   GET /api/email-processing/job/:jobId
 * @desc    Get status of a background job
 * @access  Private
 */
router.get('/job/:jobId', emailProcessingController.getJobStatus);

/**
 * @route   GET /api/email-processing/active-jobs
 * @desc    Get all active background jobs
 * @access  Private
 */
router.get('/active-jobs', emailProcessingController.getActiveJobs);

/**
 * @route   POST /api/email-processing/extract-url
 * @desc    Extract job data from a URL
 * @access  Private
 */
router.post('/extract-url', emailProcessingController.extractFromUrl);

module.exports = router;