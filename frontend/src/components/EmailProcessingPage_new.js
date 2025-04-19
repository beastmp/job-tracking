// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useLoading } from '../contexts/LoadingContext';

const DEFAULT_SEARCH_TIMEFRAME_DAYS = parseInt(process.env.REACT_APP_DEFAULT_SEARCH_TIMEFRAME_DAYS || '90', 10);
const DEFAULT_EMAIL_FOLDERS = ['INBOX'];

/**
 * Email Processing Page - New implementation with background processing
 * Handles email searching, processing, and job enrichment
 */
const EmailProcessingPage = ({ refreshData }) => {
  const { setLoadingMessage } = useLoading();

  // Credential states
  const [credentials, setCredentials] = useState([]);
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

  // UI states
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newFolder, setNewFolder] = useState('');
  const [availableFolders, setAvailableFolders] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Process states
  const [activeJobs, setActiveJobs] = useState([]);
  const [enrichmentStatus, setEnrichmentStatus] = useState({ isProcessing: false, queueSize: 0 });
  const [selectedCredentialId, setSelectedCredentialId] = useState(null);
  const [ignorePreviousImport, setIgnorePreviousImport] = useState(false);
  const [manualUrl, setManualUrl] = useState('');

  // Loading states
  const [fetchLoading, setFetchLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Fetch data on component mount
  useEffect(() => {
    fetchCredentials();
    fetchActiveJobs();
    fetchEnrichmentStatus();

    // Set up intervals for polling
    const jobsInterval = setInterval(fetchActiveJobs, 5000);
    const enrichmentInterval = setInterval(fetchEnrichmentStatus, 10000);

    return () => {
      clearInterval(jobsInterval);
      clearInterval(enrichmentInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toast auto-hide effect
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fetch credentials
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
      const response = await api.get('/emails/enrichment-status');
      if (response.data.success) {
        setEnrichmentStatus(response.data.status);
      }
    } catch (error) {
      console.error("Error fetching enrichment status:", error);
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

  // Start an email search job
  const startEmailSearch = async (credentialId) => {
    try {
      setLoadingMessage('Starting email search...');

      const response = await api.post('/email-processing/search', {
        credentialId,
        options: { ignorePreviousImport }
      });

      setToastMessage({
        type: 'info',
        text: 'Email search started in the background'
      });

      // Refresh active jobs list
      fetchActiveJobs();

      return response.data.jobId;
    } catch (error) {
      console.error('Error starting email search:', error);
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error starting email search'
      });
      return null;
    } finally {
      setLoadingMessage(null);
    }
  };

  // Start an email sync job (search + process)
  const startEmailSync = async (credentialId) => {
    try {
      setLoadingMessage('Starting email sync operation...');

      const response = await api.post('/email-processing/sync', {
        credentialId,
        options: { ignorePreviousImport }
      });

      setToastMessage({
        type: 'info',
        text: 'Email sync operation started in the background'
      });

      // Refresh active jobs list
      fetchActiveJobs();

      return response.data.jobId;
    } catch (error) {
      console.error('Error starting email sync:', error);
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error starting email sync'
      });
      return null;
    } finally {
      setLoadingMessage(null);
    }
  };

  // Start web enrichment process
  const startEnrichment = async () => {
    try {
      setLoadingMessage('Starting web enrichment process...');

      const response = await api.post('/email-processing/enrichment');

      setToastMessage({
        type: 'info',
        text: 'Web enrichment process started in the background'
      });

      // Refresh active jobs and status
      fetchActiveJobs();
      fetchEnrichmentStatus();

      return response.data.jobId;
    } catch (error) {
      console.error('Error starting enrichment:', error);
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error starting enrichment'
      });
      return null;
    } finally {
      setLoadingMessage(null);
    }
  };

  // Enrich a job using a specific URL
  const enrichJobUrl = async () => {
    if (!manualUrl) {
      setToastMessage({
        type: 'warning',
        text: 'Please enter a URL to enrich'
      });
      return;
    }

    try {
      setLoadingMessage('Queuing URL for enrichment...');

      const response = await api.post('/email-processing/enrich-url', {
        url: manualUrl
      });

      setToastMessage({
        type: 'success',
        text: 'URL queued for enrichment'
      });

      // Clear the URL field
      setManualUrl('');

      // Start the enrichment process
      await startEnrichment();

      // Refresh status
      fetchEnrichmentStatus();

      return response;
    } catch (error) {
      console.error('Error enriching URL:', error);
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error queueing URL for enrichment'
      });
      return null;
    } finally {
      setLoadingMessage(null);
    }
  };

  // Get job status information object for display
  const getJobStatusInfo = (job) => {
    if (!job) return { text: 'Unknown', color: 'secondary' };

    switch(job.status) {
      case 'processing':
        return { text: 'Processing', color: 'primary' };
      case 'completed':
        return { text: 'Completed', color: 'success' };
      case 'failed':
        return { text: 'Failed', color: 'danger' };
      case 'queued':
        return { text: 'Queued', color: 'info' };
      default:
        return { text: job.status, color: 'secondary' };
    }
  };

  // Format date for display
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // Format job duration
  const formatDuration = (startDate, endDate) => {
    if (!startDate) return 'N/A';

    const start = new Date(startDate).getTime();
    const end = endDate ? new Date(endDate).getTime() : Date.now();
    const durationMs = end - start;

    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Format job type for display
  const getJobTypeName = (type) => {
    switch (type) {
      case 'email_search':
        return 'Email Search';
      case 'email_process':
        return 'Process Items';
      case 'email_sync':
        return 'Email Sync';
      case 'web_enrichment':
        return 'Web Enrichment';
      default:
        return type || 'Unknown';
    }
  };

  return (
    <div className="email-processing">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Email Processing</h2>
        <Link to="/" className="btn btn-outline-secondary">Back to Dashboard</Link>
      </div>

      {/* Toast message */}
      {toastMessage && (
        <div className={`alert alert-${toastMessage.type} alert-dismissible fade show`} role="alert">
          {toastMessage.text}
          <button
            type="button"
            className="btn-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      <div className="row">
        {/* Credentials section */}
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
                      <div className="border rounded p-2" style={{maxHeight: '200px', overflowY: 'auto'}}>
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
                            <label className="form-check-label" htmlFor={`folder-${index}`}>
                              {folder}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="d-flex mb-2">
                    <input
                      type="text"
                      className="form-control me-2"
                      placeholder="Enter folder name manually"
                      value={newFolder}
                      onChange={(e) => setNewFolder(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        if (newFolder && !formData.searchFolders.includes(newFolder)) {
                          setFormData({
                            ...formData,
                            searchFolders: [...formData.searchFolders, newFolder]
                          });
                          setNewFolder('');
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>

                  {formData.searchFolders.length > 0 && (
                    <div className="list-group mt-2">
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

                          <div className="form-check form-check-inline align-self-center ms-2">
                            <input
                              type="radio"
                              className="form-check-input"
                              id={`credential-${credential._id}`}
                              name="selectedCredential"
                              checked={selectedCredentialId === credential._id}
                              onChange={() => setSelectedCredentialId(credential._id)}
                            />
                            <label className="form-check-label" htmlFor={`credential-${credential._id}`}>
                              Select for operations
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

          {/* Email Operations Section */}
          {credentials.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h5 className="mb-0">Email Operations</h5>
              </div>
              <div className="card-body">
                {!selectedCredentialId ? (
                  <div className="alert alert-warning">
                    Please select an email credential to use for operations
                  </div>
                ) : (
                  <>
                    <div className="d-flex gap-2 flex-wrap mb-3">
                      <button
                        className="btn btn-primary"
                        onClick={() => startEmailSync(selectedCredentialId)}
                        disabled={!selectedCredentialId}
                      >
                        Sync & Import
                      </button>

                      <button
                        className="btn btn-outline-primary"
                        onClick={() => startEmailSearch(selectedCredentialId)}
                        disabled={!selectedCredentialId}
                      >
                        Search Only
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

                    <div className="alert alert-info">
                      <small>
                        <strong>Sync & Import</strong> searches for job-related emails and automatically imports them into your job tracker.
                        <br />
                        <strong>Search Only</strong> finds job-related emails but doesn't import them.
                      </small>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Web Enrichment Section */}
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">Web Enrichment</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <p>Enrich job listings with detailed information from websites.</p>

                <button
                  className="btn btn-success mb-3"
                  onClick={startEnrichment}
                >
                  Start Enrichment Process
                </button>

                <div className="input-group mb-3">
                  <input
                    type="url"
                    className="form-control"
                    placeholder="Enter job listing URL to enrich"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                  />
                  <button
                    className="btn btn-outline-success"
                    type="button"
                    onClick={enrichJobUrl}
                    disabled={!manualUrl}
                  >
                    Enrich URL
                  </button>
                </div>
              </div>

              {/* Enrichment Status */}
              {(enrichmentStatus.isProcessing || enrichmentStatus.queueSize > 0) && (
                <div className="alert alert-info">
                  <div className="d-flex justify-content-between mb-2">
                    <span>Status:</span>
                    <strong>{enrichmentStatus.isProcessing ? 'Active' : 'Queued'}</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-3">
                    <span>Jobs in Queue:</span>
                    <strong>{enrichmentStatus.queueSize}</strong>
                  </div>

                  {enrichmentStatus.queueSize > 0 && (
                    <div className="progress mb-3">
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated bg-info"
                        role="progressbar"
                        style={{ width: `${Math.min(100, (100 * (1 - enrichmentStatus.queueSize / (enrichmentStatus.queueSize + 1))))}%` }}
                        aria-valuenow={enrichmentStatus.queueSize}
                        aria-valuemin="0"
                      />
                    </div>
                  )}

                  <small>
                    Job data is being enriched with details from websites in the background. This process happens with rate limiting to avoid being blocked by websites.
                  </small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Jobs Section */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">Active & Recent Jobs</h5>
        </div>
        <div className="card-body">
          {activeJobs.length === 0 ? (
            <p className="text-center">No active or recent jobs</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {activeJobs.map(job => {
                    const statusInfo = getJobStatusInfo(job);
                    return (
                      <tr key={job.id}>
                        <td><small>{job.id}</small></td>
                        <td>{getJobTypeName(job.type)}</td>
                        <td>
                          <span className={`badge bg-${statusInfo.color}`}>
                            {statusInfo.text}
                          </span>
                        </td>
                        <td>
                          {job.status === 'processing' && (
                            <div className="progress" style={{ height: '15px' }}>
                              <div
                                className="progress-bar progress-bar-striped progress-bar-animated"
                                role="progressbar"
                                style={{ width: `${job.progress || 0}%` }}
                              />
                            </div>
                          )}
                          {job.progress !== undefined && `${job.progress}%`}
                        </td>
                        <td><small>{formatDateTime(job.startTime)}</small></td>
                        <td><small>{formatDuration(job.startTime, job.endTime)}</small></td>
                        <td><small>{job.message}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3">
            <button
              className="btn btn-outline-secondary"
              onClick={fetchActiveJobs}
            >
              Refresh Jobs
            </button>
          </div>
        </div>
      </div>

      {/* Job Results Section - Will be shown when a job completes */}
      {activeJobs.some(job => job.status === 'completed' && job.result) && (
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="mb-0">Recent Results</h5>
          </div>
          <div className="card-body">
            {activeJobs.filter(job => job.status === 'completed' && job.result).map(job => (
              <div key={`result-${job.id}`} className="alert alert-success mb-3">
                <h6>{getJobTypeName(job.type)} Results:</h6>
                <p>{job.result.message}</p>

                {job.type === 'email_search' && job.result.stats && (
                  <ul className="mb-0">
                    <li>Total applications found: {job.result.stats.applications || 0}</li>
                    <li>New applications: {job.result.stats.newApplications || 0}</li>
                    <li>Status updates: {job.result.stats.statusUpdates || 0}</li>
                    <li>Responses: {job.result.stats.responses || 0}</li>
                  </ul>
                )}

                {job.type === 'email_sync' && job.result.stats && (
                  <ul className="mb-0">
                    <li>Applications imported: {job.result.stats.applications?.added || 0}</li>
                    <li>Status updates processed: {job.result.stats.statusUpdates?.processed || 0}</li>
                    <li>Responses processed: {job.result.stats.responses?.processed || 0}</li>
                  </ul>
                )}

                {(job.type === 'email_search' || job.type === 'email_sync') && (
                  <div className="mt-2">
                    <Link to="/applications" className="btn btn-sm btn-outline-primary">
                      View Applications
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailProcessingPage;