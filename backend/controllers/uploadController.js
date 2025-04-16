const multer = require('multer');
const path = require('path');
const fs = require('fs');
const importService = require('../services/importService');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter for Excel files
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel and CSV files are allowed!'), false);
  }
};

// Configure multer upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Main middleware for handling file uploads
exports.uploadExcel = upload.single('excelFile');

// Process and import Excel file
exports.importJobs = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file' });
    }

    const filePath = req.file.path;

    try {
      // Process the Excel file using our import service
      const result = await importService.processExcelFile(filePath);

      // Build response message
      const enrichmentMessage = result.enrichedCount > 0
        ? ` Enriched ${result.enrichedCount} jobs with LinkedIn data.`
        : '';

      const message = `Successfully imported ${result.stats.added} jobs.${enrichmentMessage} Failed to import ${result.stats.errors} jobs.`;

      // Delete the uploaded file
      fs.unlinkSync(filePath);

      // Return success response
      res.status(201).json({
        message,
        ...result.stats,
        importedCount: result.stats.added,
        enrichedCount: result.stats.enriched,
        duplicateCount: result.stats.duplicates,
        errorCount: result.stats.errors
      });
    } catch (error) {
      // Make sure to delete the file if there's an error in processing
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  } catch (error) {
    // Clean up on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('Import error:', error);
    res.status(500).json({
      message: 'Error importing jobs from Excel',
      error: error.message
    });
  }
};