import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as xlsx from 'xlsx';
import api from '../utils/api';

const ExcelUploadPage = ({ onImportJobs }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [templateUrl, setTemplateUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Generate a sample template Excel file
  const generateExcelTemplate = useCallback(() => {
    // Skip if template URL already exists
    if (templateUrl) return templateUrl;

    const ws = xlsx.utils.json_to_sheet([{
      'Source': 'Example: LinkedIn',
      'Search Type': 'Example: Direct',
      'Application Through': 'Example: Company Website',
      'Company': 'Example: Acme Inc.',
      'Company Location': 'Example: New York, NY',
      'Location Type': 'Remote',
      'Employment Type': 'Full-time',
      'Job Title': 'Example: Software Engineer',
      'Wages': 80000,
      'Wages Max': 100000,
      'Wage Type': 'Yearly',
      'Applied': '2025-04-14',
      'RespondedDate': '2025-04-20',
      'Responded': 'Yes',
      'Response': 'Phone Screen',
      'Website': 'https://example.com/job',
      'Description': 'Job description goes here',
      'Notes': 'Any additional notes'
    }]);

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Jobs');

    const excelBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Create download link
    const url = URL.createObjectURL(blob);
    setTemplateUrl(url);

    return url;
  }, []); // Don't include templateUrl in the dependency array

  useEffect(() => {
    // Generate the template on component mount only if it doesn't exist
    generateExcelTemplate();

    // Clean up on unmount
    return () => {
      if (templateUrl) {
        URL.revokeObjectURL(templateUrl);
      }
    };
  }, [generateExcelTemplate]); // Only depend on the generateExcelTemplate function

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
      setUploadResult(null);
      setUploadProgress(0);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    const formData = new FormData();
    // Update the form field name to match the controller's expected parameter
    formData.append('excelFile', selectedFile);

    let progressInterval;

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      // Start with a small percentage to indicate the upload is starting
      setUploadProgress(5);

      // Set up a simulation for more visible progress
      progressInterval = simulateProgress();

      // Update the API endpoint to match the controller
      const response = await api.post('/upload/import-excel', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        // We'll keep this for actual upload progress, but supplement with simulation
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            // Calculate and update progress percentage
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            // Only update if our simulated progress is less than the actual
            // This prevents the progress bar from jumping back
            if (percentCompleted > uploadProgress && percentCompleted < 90) {
              setUploadProgress(percentCompleted);
            }
          }
        }
      });

      // Clear the interval once the request is complete
      clearInterval(progressInterval);

      // Indicate processing is happening
      setUploadProgress(95);
      setProgressMessage('Processing data...');

      // Simulate a short delay for processing
      setTimeout(() => {
        setUploadProgress(100);
        setProgressMessage('Import complete!');

        setUploadResult(response.data);
        setSelectedFile(null);

        // Reset the file input
        document.getElementById('excelFileInput').value = '';

        // Refresh the jobs list after successful import
        if (onImportJobs) {
          onImportJobs();
        }

        // Reset the progress after showing 100% for a moment
        setTimeout(() => {
          setIsUploading(false);
          setProgressMessage('');
        }, 1000);
      }, 800);

    } catch (err) {
      clearInterval(progressInterval);
      setError('Error uploading file: ' + (err.response?.data?.message || err.message));
      setUploadProgress(0);
      setProgressMessage('');
      setIsUploading(false);
    }
  };

  // Simulate progress for better visual feedback
  const simulateProgress = () => {
    // Define the stages for Excel file processing
    const progressMessages = [
      'Uploading file...',
      'Validating Excel data...',
      'Parsing job applications...',
      'Preparing to import...',
    ];

    let currentStep = 0;
    setProgressMessage(progressMessages[0]);

    return setInterval(() => {
      if (currentStep < progressMessages.length) {
        // Update the message for the current step
        setProgressMessage(progressMessages[currentStep]);
        currentStep++;

        // Calculate progress based on steps
        // Leave room at the end for the real progress to take over
        const progress = Math.min(85, 5 + (currentStep * 20));
        setUploadProgress(progress);
      }
    }, 700); // Update every 700ms for a more realistic feel
  };

  return (
    <div className="excel-upload mt-4">
      <h2>Upload Excel File</h2>
      <p>Upload an Excel file to import multiple job applications at once.</p>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">Instructions</h5>
        </div>
        <div className="card-body">
          <ol>
            <li>Download the template Excel file to see the expected format</li>
            <li>Fill in your job application data following the template format</li>
            <li>Save your Excel file</li>
            <li>Upload the file using the form below</li>
          </ol>

          {templateUrl && (
            <a
              href={templateUrl}
              download="job_applications_template.xlsx"
              className="btn btn-secondary"
            >
              Download Template Excel File
            </a>
          )}
        </div>
      </div>

      <form onSubmit={handleUpload}>
        <div className="mb-3">
          <label htmlFor="excelFileInput" className="form-label">Select Excel File</label>
          <input
            type="file"
            id="excelFileInput"
            className="form-control"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
          />
          <div className="form-text">Accepted formats: .xlsx, .xls, .csv</div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload and Import'}
        </button>
      </form>

      {isUploading && (
        <div className="mt-3">
          <div className="progress" style={{ height: '20px', position: 'relative' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              role="progressbar"
              style={{ width: `${uploadProgress}%` }}
              aria-valuenow={uploadProgress}
              aria-valuemin="0"
              aria-valuemax="100"
            >
            </div>
            <div className="position-absolute d-flex align-items-center justify-content-center" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
              <span>{uploadProgress < 100 ? 'Uploading...' : 'Processing...'}</span>
            </div>
          </div>
          <div className="text-center mt-1">
            <small className="text-muted">
              {progressMessage || (uploadProgress < 100
                ? `Uploading file (${uploadProgress}%)`
                : 'Processing file content...')}
            </small>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger mt-3">
          {error}
        </div>
      )}

      {uploadResult && (
        <div className="alert alert-success mt-3">
          <h5>Import Successful!</h5>
          <p>{uploadResult.message}</p>
          <p>
            <Link to="/" className="btn btn-sm btn-outline-success mt-2">
              View Imported Jobs
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};

export default ExcelUploadPage;