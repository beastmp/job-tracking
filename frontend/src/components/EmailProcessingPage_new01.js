import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { LoadingContext } from '../contexts/LoadingContext';

// Default search configuration
const DEFAULT_SEARCH_TIMEFRAME_DAYS = parseInt(process.env.REACT_APP_DEFAULT_SEARCH_TIMEFRAME_DAYS || '90', 10);
const DEFAULT_EMAIL_FOLDERS = ['INBOX'];

/**
 * Email integration and processing component
 * Provides UI for:
 * - Managing email credentials
 * - Searching and importing job data from emails
 * - Monitoring enrichment status
 */
const EmailProcessingPage = ({ refreshJobList }) => {
  // Context for loading state
  // eslint-disable-next-line no-unused-vars
  const { setLoading } = useContext(LoadingContext);

  // State for email credentials
  const [credentials, setCredentials] = useState([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  // State for credential form
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    imapHost: '',
    imapPort: '',
    useTLS: true,
    rejectUnauthorized: true,
    searchTimeframeDays: DEFAULT_SEARCH_TIMEFRAME_DAYS,
    searchFolders: DEFAULT_EMAIL_FOLDERS
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [availableFolders, setAvailableFolders] = useState([]);

  // State for email search and sync
  const [emailSearchLoading, setEmailSearchLoading] = useState(false);
  const [ignorePreviousImport, setIgnorePreviousImport] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // State for background jobs
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobPollingInterval, setJobPollingInterval] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [activeJobs, setActiveJobs] = useState([]);

  // State for enrichment
  const [enrichmentStatus, setEnrichmentStatus] = useState({
    isProcessing: false,
    queueSize: 0,
    processed: 0,
    totalQueued: 0
  });

  // State for found items
  const [emailResults, setEmailResults] = useState(null);
  const [processingDetails, setProcessingDetails] = useState({
    emailsTotal: 0,
    emailsProcessed: 0,
    foldersTotal: 0,
    foldersProcessed: 0,
    enrichmentTotal: 0,
    enrichmentProcessed: 0
  });

  // State for toast messages
  const [toastMessage, setToastMessage] = useState(null);

  // Initialize data on component mount
  useEffect(() => {
    fetchCredentials();
    fetchActiveJobs();
    fetchEnrichmentStatus();

    // Set up polling interval for enrichment status
    const enrichmentInterval = setInterval(fetchEnrichmentStatus, 10000);

    return () => {
      clearInterval(enrichmentInterval);
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up job polling when activeJobId changes
  useEffect(() => {
    if (activeJobId) {
      // Poll every 2 seconds for job status
      const interval = setInterval(() => {
        pollJobStatus(activeJobId);
      }, 2000);

      setJobPollingInterval(interval);

      // Start polling immediately
      pollJobStatus(activeJobId);

      return () => clearInterval(interval);
    } else if (jobPollingInterval) {
      clearInterval(jobPollingInterval);
      setJobPollingInterval(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  // Fetch stored email credentials
  const fetchCredentials = async () => {
    try {
      setFetchLoading(true);
      const response = await api.get('/emails/credentials');
      setCredentials(response.data.credentials || []);

      // If there's at least one credential, select it by default
      if (response.data.credentials?.length > 0 && !selectedCredentialId) {
        setSelectedCredentialId(response.data.credentials[0]._id);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      setError('Failed to load saved email credentials');
    } finally {
      setFetchLoading(false);
    }
  };

  // Fetch active jobs
  const fetchActiveJobs = async () => {
    try {
      const response = await api.get('/email-processing/active-jobs');
      setActiveJobs(response.data || []);
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    }
  };

  // Fetch enrichment status
  const fetchEnrichmentStatus = async () => {
    try {
      const response = await api.get('/email-processing/enrichment-status');
      if (response.data.success) {
        setEnrichmentStatus(response.data.status);
      }
    } catch (error) {
      console.error('Error fetching enrichment status:', error);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Reset form to default values
  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      imapHost: '',
      imapPort: '',
      useTLS: true,
      rejectUnauthorized: true,
      searchTimeframeDays: DEFAULT_SEARCH_TIMEFRAME_DAYS,
      searchFolders: DEFAULT_EMAIL_FOLDERS
    });
    setIsEditing(false);
    setEditId(null);
    setError('');
    setSuccessMessage('');
  };

  // Fill form with common email provider settings
  const fillProvider = (provider) => {
    let imapHost = '';
    let imapPort = '';
    let useTLS = true;

    switch (provider) {
      case 'gmail':
        imapHost = 'imap.gmail.com';
        imapPort = '993';
        break;
      case 'outlook':
        imapHost = 'outlook.office365.com';
        imapPort = '993';
        break;
      case 'yahoo':
        imapHost = 'imap.mail.yahoo.com';
        imapPort = '993';
        break;
      default:
        return;
    }

    setFormData({
      ...formData,
      imapHost,
      imapPort,
      useTLS
    });
  };

  // Edit an existing credential
  const editCredential = (credential) => {
    setFormData({
      email: credential.email,
      password: '', // Password is not returned from the server
      imapHost: credential.imapHost,
      imapPort: credential.imapPort,
      useTLS: credential.useTLS,
      rejectUnauthorized: credential.rejectUnauthorized,
      searchTimeframeDays: credential.searchTimeframeDays || DEFAULT_SEARCH_TIMEFRAME_DAYS,
      searchFolders: credential.searchFolders || DEFAULT_EMAIL_FOLDERS
    });
    setIsEditing(true);
    setEditId(credential._id);
    setError('');
    setSuccessMessage('');
    window.scrollTo(0, 0);
  };

  // Delete a credential
  const deleteCredential = async (id) => {
    if (window.confirm('Are you sure you want to delete these credentials?')) {
      try {
        await api.delete(`/emails/credentials/${id}`);
        setToastMessage({
          type: 'success',
          text: 'Credentials deleted successfully'
        });
        fetchCredentials();

        // If the deleted credential was selected, reset selection
        if (selectedCredentialId === id) {
          setSelectedCredentialId(null);
        }
      } catch (error) {
        console.error('Error deleting credentials:', error);
        setToastMessage({
          type: 'danger',
          text: 'Failed to delete credentials'
        });
      }
    }
  };

  // Handle credential form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Simple validation
    if (!formData.email || !formData.imapHost || !formData.imapPort) {
      setError('Email, IMAP host, and port are required');
      return;
    }

    // Require password for new credentials
    if (!isEditing && !formData.password) {
      setError('Password is required for new credentials');
      return;
    }

    try {
      setFormLoading(true);
      setError('');
      setSuccessMessage('');

      await api.post('/emails/credentials', formData);

      setToastMessage({
        type: 'success',
        text: 'Email credentials saved successfully'
      });
      resetForm();
      await fetchCredentials();
    } catch (error) {
      console.error('Error saving credentials:', error);
      setError(error.response?.data?.message || 'Failed to save email credentials');
    } finally {
      setFormLoading(false);
    }
  };

  // Fetch available folders for an email account
  const fetchAvailableFolders = async (credentialId) => {
    try {
      setFoldersLoading(true);
      setError('');

      const response = await api.post('/emails/get-folders', { credentialId });

      if (response.data.folders && response.data.folders.length > 0) {
        setAvailableFolders(response.data.folders);
        setToastMessage({
          type: 'success',
          text: 'Successfully retrieved email folders'
        });
      } else {
        setToastMessage({
          type: 'warning',
          text: 'No folders found on the email server'
        });
      }
    } catch (error) {
      console.error('Error fetching email folders:', error);
      setError(error.response?.data?.message || 'Failed to fetch email folders');
    } finally {
      setFoldersLoading(false);
    }
  };

  // Start email sync process
  const runSync = async (credentialId) => {
    try {
      setEmailSearchLoading(true);
      setEmailResults(null);
      setProgress(5);
      setProgressMessage('Initializing sync operation...');

      // Reset processing details when starting a new sync
      setProcessingDetails({
        emailsTotal: 0,
        emailsProcessed: 0,
        foldersTotal: 0,
        foldersProcessed: 0,
        enrichmentTotal: 0,
        enrichmentProcessed: 0
      });

      const response = await api.startEmailSync({
        credentialId,
        ignorePreviousImport
      });

      // If we have a job ID, start polling for job status
      if (response.data.jobId) {
        setActiveJobId(response.data.jobId);
        setToastMessage({
          type: 'info',
          text: 'Email sync started in the background'
        });
      } else {
        setToastMessage({
          type: 'danger',
          text: 'Failed to start email sync job'
        });
        setEmailSearchLoading(false);
        setProgress(0);
        setProgressMessage('');
      }
    } catch (error) {
      console.error('Error starting email sync:', error);
      setEmailSearchLoading(false);
      setProgress(0);
      setProgressMessage('');

      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error syncing emails'
      });
    }
  };

  // Run enrichment for a job
  const runEnrichment = async () => {
    try {
      setToastMessage({
        type: 'info',
        text: 'Starting job enrichment in the background...'
      });

      const response = await api.startEnrichment();

      if (response.data.jobId) {
        setActiveJobId(response.data.jobId);
      }
    } catch (error) {
      console.error('Error starting enrichment:', error);
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error starting enrichment'
      });
    }
  };

  // Poll job status
  const pollJobStatus = async (jobId) => {
    if (!jobId) return;

    try {
      const response = await api.getJobDetails(jobId);
      const job = response.data.job;

      if (!job) {
        // Job not found, stop polling
        setActiveJobId(null);
        return;
      }

      // Update progress based on job status
      if (job.status === 'running' || job.status === 'queued') {
        // Update progress bar
        setProgress(job.progress || 10);
        if (job.message) setProgressMessage(job.message);
      }
      else if (job.status === 'completed') {
        // Job completed successfully
        setProgress(100);
        setProgressMessage('Operation completed successfully!');
        setEmailSearchLoading(false);

        // Extract the results
        if (job.result) {
          // Handle job result based on type
          if (job.type === 'email_sync') {
            handleSyncResults(job.result);
          } else if (job.type === 'job_enrichment') {
            fetchEnrichmentStatus(); // Refresh enrichment status

            setToastMessage({
              type: 'success',
              text: `Enrichment completed - Processed ${job.result.processed || 0} job listings`
            });
          }
        }

        // Stop polling
        setActiveJobId(null);

        // Refresh job list if available
        if (refreshJobList) {
          refreshJobList();
        }

        // After a moment, reset progress indicators
        setTimeout(() => {
          setProgress(0);
          setProgressMessage('');
        }, 2000);
      }
      else if (job.status === 'failed') {
        // Job failed
        setProgress(0);
        setProgressMessage('');
        setEmailSearchLoading(false);

        // Show error message
        setToastMessage({
          type: 'danger',
          text: job.error || 'Operation failed'
        });

        // Stop polling
        setActiveJobId(null);
      }
    } catch (error) {
      console.error('Error polling job status:', error);
      // Stop polling on error
      setActiveJobId(null);
    }
  };

  // Handle sync results
  const handleSyncResults = (result) => {
    // Set email search results
    setEmailResults({
      success: true,
      message: result.message || `Sync completed - Found ${result.applications?.length || 0} applications`,
      applications: result.applications || [],
      statusUpdates: result.statusUpdates || [],
      responses: result.responses || [],
      stats: result.stats,
      pendingEnrichments: result.pendingEnrichments || 0
    });

    // Update processing details if available
    if (result.processingStats) {
      setProcessingDetails(result.processingStats);
    }

    // Show success toast
    setToastMessage({
      type: 'success',
      text: `Sync completed - Processed ${result.stats?.applications?.added || 0} applications`
    });
  };

  return (
    <div className="email-processing-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Email Integration</h2>
        <Link to="/" className="btn btn-outline-secondary">Back to Dashboard</Link>
      </div>

      {/* Toast notifications */}
      {toastMessage && (
        <div
          className={`toast show position-fixed top-0 end-0 m-4 bg-${toastMessage.type}`}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{ zIndex: 1050 }}
        >
          <div className="toast-header">
            <strong className="me-auto">Job Tracker</strong>
            <button
              type="button"
              className="btn-close"
              onClick={() => setToastMessage(null)}
            ></button>
          </div>
          <div className="toast-body text-white">
            {toastMessage.text}
          </div>
        </div>
      )}

      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">{isEditing ? 'Edit Email Credentials' : 'Add Email Credentials'}</h5>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {successMessage && <div className="alert alert-success">{successMessage}</div>}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="password" className="form-label">
                    Password {isEditing && <span className="text-muted">(leave blank to keep current password)</span>}
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required={!isEditing}
                  />
                  <div className="form-text">
                    Your password is securely encrypted and stored in the database.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Provider</label>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => fillProvider('gmail')}>Gmail</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => fillProvider('outlook')}>Outlook</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => fillProvider('yahoo')}>Yahoo</button>
                  </div>
                </div>

                <div className="mb-3">
                  <label htmlFor="imapHost" className="form-label">IMAP Host</label>
                  <input
                    type="text"
                    className="form-control"
                    id="imapHost"
                    name="imapHost"
                    value={formData.imapHost}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="imapPort" className="form-label">IMAP Port</label>
                  <input
                    type="text"
                    className="form-control"
                    id="imapPort"
                    name="imapPort"
                    value={formData.imapPort}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="mb-3 form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="useTLS"
                    name="useTLS"
                    checked={formData.useTLS}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label" htmlFor="useTLS">Use TLS (recommended)</label>
                </div>

                <div className="mb-3 form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="rejectUnauthorized"
                    name="rejectUnauthorized"
                    checked={formData.rejectUnauthorized}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label" htmlFor="rejectUnauthorized">
                    Validate SSL certificates (disable only if you have self-signed certificates)
                  </label>
                </div>

                <hr className="my-4" />

                <h6 className="mb-3">Search Configuration</h6>

                <div className="mb-3">
                  <label htmlFor="searchTimeframeDays" className="form-label">
                    Search Timeframe (days)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    id="searchTimeframeDays"
                    name="searchTimeframeDays"
                    value={formData.searchTimeframeDays}
                    onChange={handleInputChange}
                    min="1"
                    max="365"
                  />
                  <div className="form-text">
                    Number of days to look back when searching emails. Default is 90 days.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Email Folders to Search</label>

                  {isEditing && (
                    <div className="mb-3">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => fetchAvailableFolders(editId)}
                        disabled={foldersLoading}
                      >
                        {foldersLoading ? 'Fetching folders...' : 'Fetch Available Folders'}
                      </button>
                      {foldersLoading && <span className="ms-2">Connecting to email server...</span>}
                    </div>
                  )}

                  {availableFolders.length > 0 && (
                    <div className="mb-3">
                      <label className="form-label">Available Folders</label>
                      <div className="border rounded p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {availableFolders.map((folder, index) => (
                          <div key={index} className="form-check">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id={`folder-${index}`}
                              checked={formData.searchFolders.includes(folder)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    searchFolders: [...formData.searchFolders, folder]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    searchFolders: formData.searchFolders.filter(f => f !== folder)
                                  });
                                }
                              }}
                            />
                            <label className="form-check-label" htmlFor={`folder-${index}`}>{folder}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.searchFolders.length > 0 && (
                    <div className="list-group mb-3">
                      <div className="list-group-item active">Selected Folders</div>
                      {formData.searchFolders.map((folder, index) => (
                        <div key={index} className="list-group-item d-flex justify-content-between align-items-center">
                          {folder}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                searchFolders: formData.searchFolders.filter((_, i) => i !== index)
                              });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="form-text mt-2">
                    <strong>Gmail users:</strong> Gmail folders need specific formats like "[Gmail]/All Mail" instead of "All Mail" or "INBOX/Applied".
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={formLoading}
                  >
                    {formLoading ? 'Saving...' : (isEditing ? 'Update Credentials' : 'Save Credentials')}
                  </button>

                  {isEditing && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={resetForm}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          {/* Saved Credentials Section */}
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">Saved Email Credentials</h5>
            </div>
            <div className="card-body">
              {fetchLoading ? (
                <p className="text-center">Loading saved credentials...</p>
              ) : credentials.length === 0 ? (
                <p className="text-center">No saved email credentials. Add credentials to enable email integration.</p>
              ) : (
                <>
                  <div className="list-group">
                    {credentials.map((credential) => (
                      <div key={credential._id} className="list-group-item list-group-item-action">
                        <div className="d-flex w-100 justify-content-between">
                          <h5 className="mb-1">{credential.email}</h5>
                          <small className="text-muted">
                            Last synced: {credential.lastImport ? new Date(credential.lastImport).toLocaleString() : 'Never'}
                          </small>
                        </div>
                        <p className="mb-1">Server: {credential.imapHost}:{credential.imapPort}</p>
                        <p className="mb-1">
                          <small className="text-muted">
                            Search: {credential.searchTimeframeDays} days | Folders: {credential.searchFolders.join(', ')}
                          </small>
                        </p>
                        <div className="mt-2 d-flex gap-2 flex-wrap">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => editCredential(credential)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => deleteCredential(credential._id)}
                          >
                            Delete
                          </button>

                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => runSync(credential._id)}
                            disabled={emailSearchLoading || !!activeJobId}
                          >
                            {activeJobId ? 'Processing...' : 'Sync & Import'}
                          </button>

                          <div className="form-check form-check-inline align-self-center ms-2">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id="ignorePreviousImport"
                              checked={ignorePreviousImport}
                              onChange={(e) => setIgnorePreviousImport(e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="ignorePreviousImport">
                              Force Full Sync
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {progress > 0 && (
            <div className="card mb-4">
              <div className="card-body">
                <div className="progress" style={{ height: '20px' }}>
                  <div
                    className="progress-bar progress-bar-striped progress-bar-animated"
                    role="progressbar"
                    style={{ width: `${progress}%` }}
                    aria-valuenow={progress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {progress}%
                  </div>
                </div>
                {progressMessage && <p className="text-center mt-2">{progressMessage}</p>}

                {processingDetails && (
                  <div className="mt-3">
                    {processingDetails.foldersTotal > 0 && (
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <div>Folders Processed:</div>
                        <div>{processingDetails.foldersProcessed} / {processingDetails.foldersTotal}</div>
                      </div>
                    )}

                    {processingDetails.emailsTotal > 0 && (
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <div>Emails Processed:</div>
                        <div>{processingDetails.emailsProcessed} / {processingDetails.emailsTotal}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LinkedIn Enrichment Status Card */}
          {(enrichmentStatus.isProcessing || enrichmentStatus.queueSize > 0) && (
            <div className="card mb-4">
              <div className="card-header bg-info text-white">
                <h5 className="mb-0">
                  <i className="bi bi-linkedin me-2"></i>
                  LinkedIn Data Enrichment
                </h5>
              </div>
              <div className="card-body">
                <div className="d-flex justify-content-between mb-2">
                  <span>Status:</span>
                  <strong>{enrichmentStatus.isProcessing ? 'Active' : 'Queued'}</strong>
                </div>
                <div className="d-flex justify-content-between mb-3">
                  <span>Jobs in Queue:</span>
                  <strong>{enrichmentStatus.queueSize}</strong>
                </div>

                {enrichmentStatus.queueSize > 0 && (
                  <div className="progress">
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-info"
                      role="progressbar"
                      style={{ width: `${Math.min(100, (100 * (1 - enrichmentStatus.queueSize / (enrichmentStatus.queueSize + enrichmentStatus.processed + 1))))}%` }}
                      aria-valuenow={enrichmentStatus.queueSize}
                      aria-valuemin="0"
                    />
                  </div>
                )}

                <div className="mt-3 small">
                  <i className="bi bi-info-circle me-1"></i>
                  Job data is being enriched with details from LinkedIn in the background. This process happens automatically to respect LinkedIn's rate limits.
                </div>
              </div>
            </div>
          )}

          {/* Email search results */}
          {emailResults && (
            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Email Integration Results</h5>
              </div>
              <div className="card-body">
                <div className={`alert ${emailResults.success ? 'alert-success' : 'alert-danger'}`}>
                  {emailResults.message}
                </div>

                {emailResults.stats && (
                  <div className="alert alert-info">
                    <h6>Sync Summary:</h6>
                    <ul className="mb-0">
                      <li>New applications: {emailResults.stats.applications?.added || 0}</li>
                      <li>Status updates processed: {emailResults.stats.statusUpdates?.processed || 0}</li>
                      <li>Responses processed: {emailResults.stats.responses?.processed || 0}</li>
                      {emailResults.pendingEnrichments > 0 && (
                        <li className="text-info">Job listings queued for enrichment: {emailResults.pendingEnrichments}</li>
                      )}
                    </ul>
                  </div>
                )}

                {((emailResults.applications?.length > 0) || (emailResults.statusUpdates?.length > 0) || (emailResults.responses?.length > 0)) && (
                  <div className="card bg-light">
                    <div className="card-body p-2">
                      <h6>Found Items Summary</h6>
                      <div className="mb-2">
                        <span className="badge bg-primary me-1">{emailResults.applications?.length || 0}</span> Applications
                        <span className="badge bg-info mx-1">{emailResults.statusUpdates?.length || 0}</span> Status Updates
                        <span className="badge bg-warning mx-1">{emailResults.responses?.length || 0}</span> Responses
                      </div>

                      <button
                        className="btn btn-sm btn-outline-primary"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#itemsCollapse"
                      >
                        View Details
                      </button>

                      <div className="collapse mt-2" id="itemsCollapse">
                        <ul className="list-group">
                          {emailResults.applications?.map((item, idx) => (
                            <li key={`app-${idx}`} className="list-group-item">
                              <div className="d-flex justify-content-between">
                                <div>
                                  <span className="badge bg-primary me-1">Application</span>
                                  <strong>{item.jobTitle}</strong> at {item.company}
                                </div>
                                <span className="badge bg-secondary">{item.exists ? 'Already Exists' : 'New'}</span>
                              </div>
                            </li>
                          ))}
                          {emailResults.statusUpdates?.map((item, idx) => (
                            <li key={`status-${idx}`} className="list-group-item">
                              <span className="badge bg-info me-1">Status Update</span>
                              <strong>{item.jobTitle}</strong> at {item.company}
                            </li>
                          ))}
                          {emailResults.responses?.map((item, idx) => (
                            <li key={`resp-${idx}`} className="list-group-item">
                              <span className="badge bg-warning me-1">Response</span>
                              <strong>{item.jobTitle}</strong> at {item.company} - {item.response}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {enrichmentStatus.queueSize > 0 && (
                  <div className="alert alert-info mt-3 small">
                    <i className="bi bi-info-circle me-2"></i>
                    Job enrichment is running in the background to add more details to your job listings.
                  </div>
                )}

                <div className="mt-3">
                  <button
                    className="btn btn-outline-primary"
                    onClick={runEnrichment}
                    disabled={emailSearchLoading || !!activeJobId || enrichmentStatus.isProcessing}
                  >
                    Run Manual Enrichment
                  </button>
                  <div className="form-text mt-1">
                    This will start a background process to enrich all jobs with website URLs.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailProcessingPage;