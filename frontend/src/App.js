import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import * as xlsx from 'xlsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import api, { setLoadingHandlers } from './utils/api';
import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import LoadingIndicator from './components/LoadingIndicator';

// Components
import Dashboard from './components/Dashboard';
import ApplicationsPage from './components/ApplicationsPage';
import EmailIntegration from './components/EmailIntegration';

// Get default values from environment variables with fallbacks
const DEFAULT_LOCATION_TYPE = process.env.REACT_APP_DEFAULT_LOCATION_TYPE || 'Remote';
const DEFAULT_EMPLOYMENT_TYPE = process.env.REACT_APP_DEFAULT_EMPLOYMENT_TYPE || 'Full-time';
const DEFAULT_WAGE_TYPE = process.env.REACT_APP_DEFAULT_WAGE_TYPE || 'Yearly';
const DEFAULT_RESPONSE = process.env.REACT_APP_DEFAULT_RESPONSE || 'No Response';

// Main app wrapper to provide loading context
const AppWithLoadingContext = () => {
  return (
    <LoadingProvider>
      <AppContent />
    </LoadingProvider>
  );
};

// The actual application content
const AppContent = () => {
  // Get loading state handlers from context
  const { setLoading, setLoadingMessage, setLoadingProgress } = useLoading();

  // Connect API loading handlers to loading context
  useEffect(() => {
    setLoadingHandlers({
      setLoading: (isLoading, message = '', progress = 0) => {
        setLoading(isLoading);
        setLoadingMessage(message || '');
        setLoadingProgress(progress);
      },
      setLoadingMessage,
      setLoadingProgress
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once on mount

  return (
    <>
      <AppMain />
      <LoadingIndicator />
    </>
  );
};

const JobForm = ({ job, onSubmit, isEditing }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    source: '',
    searchType: '',
    applicationThrough: '',
    company: '',
    companyLocation: '',
    locationType: DEFAULT_LOCATION_TYPE,
    employmentType: DEFAULT_EMPLOYMENT_TYPE,
    jobTitle: '',
    wagesMin: '',
    wagesMax: '',
    wageType: DEFAULT_WAGE_TYPE,
    applied: new Date().toISOString().substr(0, 10),
    responded: null, // Changed from false to null to prevent default date
    response: DEFAULT_RESPONSE,
    website: '',
    description: '',
    externalJobId: '',
    notes: ''
  });

  // For tracking status checks
  const [statusCheck, setStatusCheck] = useState({
    date: new Date().toISOString().substr(0, 10),
    notes: ''
  });

  // For handling status checks
  const [statusChecks, setStatusChecks] = useState([]);

  useEffect(() => {
    if (job) {
      const jobData = { ...job };
      if (job.applied) {
        jobData.applied = new Date(job.applied).toISOString().substr(0, 10);
      }

      // Handle status checks
      if (job.statusChecks && job.statusChecks.length > 0) {
        setStatusChecks(job.statusChecks.map(check => ({
          ...check,
          date: new Date(check.date).toISOString().substr(0, 10)
        })));
      }

      setFormData(jobData);
    }
  }, [job]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'responded' && value === '' ? null : value)
    }));
  };

  const handleStatusCheckChange = (e) => {
    const { name, value } = e.target;
    setStatusCheck(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addStatusCheck = (e) => {
    e.preventDefault();
    if (statusCheck.date && statusCheck.notes) {
      setStatusChecks([...statusChecks, { ...statusCheck }]);
      setStatusCheck({
        date: new Date().toISOString().substr(0, 10),
        notes: ''
      });
    }
  };

  const removeStatusCheck = (index) => {
    setStatusChecks(statusChecks.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Add status checks to the form data
    const finalFormData = { ...formData, statusChecks };

    try {
      await onSubmit(finalFormData);
      // No longer redirecting with page reload, let the router handle navigation
      navigate('/');
    } catch (error) {
      console.error('Error saving job:', error);
      // Handle error state if needed
    }
  };

  return (
    <div className="job-form">
      <h2>{isEditing ? 'Edit Job Application' : 'Add New Job Application'}</h2>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Job Title*</label>
            <input
              type="text"
              name="jobTitle"
              className="form-control"
              value={formData.jobTitle}
              onChange={handleChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Company*</label>
            <input
              type="text"
              name="company"
              className="form-control"
              value={formData.company}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Source</label>
            <input
              type="text"
              name="source"
              className="form-control"
              placeholder="LinkedIn, Indeed, Referral, etc."
              value={formData.source || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Search Type</label>
            <input
              type="text"
              name="searchType"
              className="form-control"
              placeholder="Direct, Recruiter, etc."
              value={formData.searchType || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Application Through</label>
            <input
              type="text"
              name="applicationThrough"
              className="form-control"
              placeholder="Company website, LinkedIn Easy Apply, etc."
              value={formData.applicationThrough || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Company Location</label>
            <input
              type="text"
              name="companyLocation"
              className="form-control"
              placeholder="City, State, Country"
              value={formData.companyLocation || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Location Type</label>
            <select
              name="locationType"
              className="form-select"
              value={formData.locationType || 'Remote'}
              onChange={handleChange}
            >
              <option value="Remote">Remote</option>
              <option value="On-site">On-site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Employment Type</label>
            <select
              name="employmentType"
              className="form-select"
              value={formData.employmentType || 'Full-time'}
              onChange={handleChange}
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
              <option value="Freelance">Freelance</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Minimum Wage</label>
            <input
              type="number"
              name="wagesMin"
              className="form-control"
              value={formData.wagesMin || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Maximum Wage</label>
            <input
              type="number"
              name="wagesMax"
              className="form-control"
              value={formData.wagesMax || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Wage Type</label>
            <select
              name="wageType"
              className="form-select"
              value={formData.wageType || 'Yearly'}
              onChange={handleChange}
            >
              <option value="Hourly">Hourly</option>
              <option value="Yearly">Yearly</option>
              <option value="Monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Project">Project</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Date Applied</label>
            <input
              type="date"
              name="applied"
              className="form-control"
              value={formData.applied}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">External Job ID</label>
            <input
              type="text"
              name="externalJobId"
              className="form-control"
              placeholder="Job ID from external source"
              value={formData.externalJobId || ''}
              onChange={handleChange}
            />
            <div className="form-text">ID from external job source (e.g., LinkedIn)</div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Job Website/URL</label>
            <input
              type="url"
              name="website"
              className="form-control"
              placeholder="https://example.com/job-posting"
              value={formData.website || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Date Responded</label>
            <input
              type="date"
              name="responded"
              className="form-control"
              value={formData.responded ? new Date(formData.responded).toISOString().substr(0, 10) : ''}
              onChange={handleChange}
            />
            <div className="form-text">Leave empty if no response received yet</div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Response Status</label>
            <select
              name="response"
              className="form-select"
              value={formData.response || 'No Response'}
              onChange={handleChange}
            >
              <option value="No Response">No Response</option>
              <option value="Rejected">Rejected</option>
              <option value="Phone Screen">Phone Screen</option>
              <option value="Interview">Interview</option>
              <option value="Offer">Offer</option>
              <option value="Hired">Hired</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Job Description</label>
          <textarea
            name="description"
            className="form-control"
            value={formData.description || ''}
            onChange={handleChange}
            rows="3"
          ></textarea>
        </div>

        <div className="mb-3">
          <label className="form-label">Notes</label>
          <textarea
            name="notes"
            className="form-control"
            value={formData.notes || ''}
            onChange={handleChange}
            rows="3"
          ></textarea>
        </div>

        <div className="card mb-4">
          <div className="card-header">
            Status Check History
          </div>
          <div className="card-body">
            <div className="mb-3">
              <div className="row">
                <div className="col-md-4">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    name="date"
                    className="form-control"
                    value={statusCheck.date}
                    onChange={handleStatusCheckChange}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    name="notes"
                    className="form-control"
                    value={statusCheck.notes}
                    onChange={handleStatusCheckChange}
                    placeholder="E.g., Sent follow-up email"
                  />
                </div>
                <div className="col-md-2 d-flex align-items-end">
                  <button
                    className="btn btn-secondary w-100"
                    onClick={addStatusCheck}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {statusChecks.length > 0 && (
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {statusChecks.map((check, index) => (
                    <tr key={index}>
                      <td>{new Date(check.date).toLocaleDateString()}</td>
                      <td>{check.notes}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeStatusCheck(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <button type="submit" className="btn btn-primary">
          {isEditing ? 'Update Job' : 'Add Job'}
        </button>
      </form>
    </div>
  );
};


const ExcelUpload = ({ onImportJobs }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [templateUrl, setTemplateUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Generate a sample template Excel file
  const generateExcelTemplate = () => {
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
  };

  useEffect(() => {
    // Generate the template on component mount
    generateExcelTemplate();

    // Clean up on unmount
    return () => {
      if (templateUrl) {
        URL.revokeObjectURL(templateUrl);
      }
    };
  }, [templateUrl]);

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

function EditJobWrapper({ selectedJob, fetchJob, handleUpdateJob }) {
  const [isLoading, setIsLoading] = useState(true);
  const [jobId, setJobId] = useState(null);

  // Extract job ID once when component mounts
  useEffect(() => {
    const id = window.location.pathname.split('/').pop();
    setJobId(id);
  }, []);

  // Only fetch job when jobId changes (once)
  useEffect(() => {
    if (!jobId) return;

    const loadJob = async () => {
      try {
        await fetchJob(jobId);
      } finally {
        setIsLoading(false);
      }
    };

    loadJob();
  }, [jobId, fetchJob]);

  return isLoading ? (
    <div className="text-center mt-5">
      <div className="spinner-border" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  ) : selectedJob ? (
    <JobForm job={selectedJob} onSubmit={handleUpdateJob} isEditing={true} />
  ) : (
    <div className="alert alert-danger">
      Failed to load job details. Please try again.
    </div>
  );
}

function AppMain() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { setLoading: setContextLoading, setLoadingMessage } = useLoading();

  // Define fetchJobs with useCallback to ensure stable reference between renders
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      // Show loading for short operations but with a minimal message
      setLoadingMessage('Loading job data...');
      // Fixed: Remove redundant /api/ prefix
      const response = await api.get('/jobs');
      setJobs(response.data);
      setLoading(false);
    } catch (err) {
      setError('Error fetching jobs: ' + err.message);
      setLoading(false);
    }
  }, [setLoadingMessage]); // Include only the dependencies that don't change frequently

  // Refresh function that components can call
  const refreshData = () => {
    // Increment refreshTrigger to cause useEffect to run
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    fetchJobs();
  }, [refreshTrigger, fetchJobs]); // Now fetchJobs has stable reference

  // Add a new job - improved to use refreshData
  const handleAddJob = async (jobData) => {
    try {
      setLoadingMessage('Saving new job application...');
      // Fixed: Remove redundant /api/ prefix
      await api.post('/jobs', jobData);
      refreshData(); // Refresh instead of redirecting
      return true;
    } catch (err) {
      setError('Error adding job: ' + err.message);
      return false;
    }
  };

  // Update a job - improved to use refreshData
  const handleUpdateJob = async (jobData) => {
    try {
      setLoadingMessage('Updating job application...');
      // Fixed: Remove redundant /api/ prefix
      await api.put(`/jobs/${jobData._id}`, jobData);
      refreshData(); // Refresh instead of redirecting
      return true;
    } catch (err) {
      setError('Error updating job: ' + err.message);
      return false;
    }
  };

  // Delete a job - improved to use refreshData
  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job application?')) {
      try {
        setLoadingMessage('Deleting job application...');
        // Fixed: Remove redundant /api/ prefix
        await api.delete(`/jobs/${jobId}`);
        refreshData();
        return true;
      } catch (err) {
        setError('Error deleting job: ' + err.message);
        return false;
      }
    }
    return false;
  };

  // Bulk delete jobs - improved to use refreshData
  const handleBulkDeleteJobs = async (jobIds) => {
    try {
      setLoadingMessage(`Deleting ${jobIds.length} job applications...`);
      // Fixed: Remove redundant /api/ prefix
      const response = await api.post('/jobs/bulk-delete', { ids: jobIds });
      refreshData();
      // Show success message
      alert(`Successfully deleted ${response.data.deletedCount} job applications`);
      return true;
    } catch (err) {
      setError('Error bulk deleting jobs: ' + (err.response?.data?.message || err.message));
      return false;
    }
  };

  // Update job status - improved to use refreshData
  const handleUpdateStatus = async (jobId, newStatus) => {
    try {
      setLoadingMessage('Updating job status...');
      // Fixed: Remove redundant /api/ prefix
      await api.put(`/jobs/${jobId}`, { response: newStatus });
      refreshData();
      return true;
    } catch (err) {
      setError('Error updating status: ' + err.message);
      return false;
    }
  };

  // Fetch a single job for editing
  const fetchJob = async (jobId) => {
    try {
      setContextLoading(true, 'Loading job details...'); // Use context loading instead of local state
      // Fixed: Remove redundant /api/ prefix
      const response = await api.get(`/jobs/${jobId}`);
      setSelectedJob(response.data);
      // Clear loading state after job data is fetched
      setContextLoading(false); // Turn off global loading spinner
      return response.data;
    } catch (err) {
      setError('Error fetching job details: ' + err.message);
      // Also clear loading state in case of error
      setContextLoading(false); // Turn off global loading spinner in case of error
      return null;
    }
  };

  return (
    <Router>
      <div className="App">
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
          <div className="container">
            <Link className="navbar-brand" to="/">Job Search Tracker</Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
              <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="navbarNav">
              <ul className="navbar-nav">
                <li className="nav-item">
                  <Link className="nav-link" to="/">Dashboard</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/applications">Applications</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/add-job">Add Job</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/upload-excel">Upload Excel</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/email-integration">Email Integration</Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <div className="container mt-4 mb-5">
          {error && <div className="alert alert-danger">{error}</div>}

          <Routes>
            <Route path="/" element={
              loading ? (
                <div className="text-center mt-5">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <Dashboard
                  jobs={jobs}
                  refreshData={refreshData} // Pass refresh function
                />
              )
            } />

            <Route path="/applications" element={
              loading ? (
                <div className="text-center mt-5">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <ApplicationsPage
                  jobs={jobs}
                  onDeleteJob={handleDeleteJob}
                  onUpdateStatus={handleUpdateStatus}
                  onBulkDeleteJobs={handleBulkDeleteJobs}
                  refreshData={refreshData} // Pass refresh function
                />
              )
            } />

            <Route path="/add-job" element={
              <JobForm onSubmit={handleAddJob} isEditing={false} />
            } />

            <Route path="/edit-job/:id" element={
              <EditJobWrapper
                selectedJob={selectedJob}
                fetchJob={fetchJob}
                handleUpdateJob={handleUpdateJob}
              />
            } />

            <Route path="/upload-excel" element={
              <ExcelUpload onImportJobs={refreshData} />
            } />

            <Route path="/email-integration" element={
              <EmailIntegration
                onImportJobs={refreshData}
                refreshData={refreshData} // Pass down both for backward compatibility
              />
            } />
                <Link to="/" className="btn btn-primary mt-3">Go to Dashboard</Link>
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default AppWithLoadingContext;
