const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// GET all jobs
router.get('/', jobController.getJobs);

// GET applications data (to fix 500 error)
router.get('/applications', jobController.getApplications);

// GET application statistics
router.get('/stats', jobController.getApplicationStats);

// GET a single job
router.get('/:id', jobController.getJob);

// POST create a new job
router.post('/', jobController.createJob);

// POST bulk delete jobs
router.post('/bulk-delete', jobController.bulkDeleteJobs);

// POST re-enrich jobs from LinkedIn
router.post('/re-enrich', jobController.reEnrichJobs);

// POST extract job data from website
router.post('/extract-from-website', jobController.extractFromWebsite);

// PUT update a job
router.put('/:id', jobController.updateJob);

// DELETE a job
router.delete('/:id', jobController.deleteJob);

module.exports = router;