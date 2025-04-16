const express = require('express');
const router = express.Router();
const { uploadExcel, importJobs } = require('../controllers/uploadController');

// Route for uploading and importing Excel files with jobs
router.post('/import-excel', uploadExcel, importJobs);

module.exports = router;
