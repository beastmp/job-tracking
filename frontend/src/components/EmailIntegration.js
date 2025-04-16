import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

// Get default configuration from environment variables with fallbacks
const DEFAULT_SEARCH_TIMEFRAME_DAYS = parseInt(process.env.REACT_APP_DEFAULT_SEARCH_TIMEFRAME_DAYS || '90', 10);
const DEFAULT_EMAIL_FOLDERS = ['INBOX'];

const EmailIntegration = ({ onImportJobs }) => {
  // Credential management state
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
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newFolder, setNewFolder] = useState('');
  const [availableFolders, setAvailableFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Search and import related states
  const [emailResults, setEmailResults] = useState(null);
  const [emailSearchLoading, setEmailSearchLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [itemsToProcess, setItemsToProcess] = useState([]);

  // Progress bar states
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Selection states
  const [ignorePreviousImport, setIgnorePreviousImport] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    fetchCredentials();
  }, []);

  // Fetch stored email credentials
  const fetchCredentials = async () => {
    try {
      setFetchLoading(true);
      // Fix the API endpoint path
      const response = await api.get(`/api/emails/credentials`);
      setCredentials(response.data.credentials || []);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      setError('Failed to load saved email credentials');
    } finally {
      setFetchLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

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
  };

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
    window.scrollTo(0, 0);
  };

  const deleteCredential = async (id) => {
    if (window.confirm('Are you sure you want to delete these credentials?')) {
      try {
        // Fix the API endpoint path
        await api.delete(`/api/emails/credentials/${id}`);
        setSuccessMessage('Credentials deleted successfully');
        fetchCredentials();
      } catch (error) {
        console.error('Error deleting credentials:', error);
        setError('Failed to delete credentials');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Simple validation
    if (!formData.email || !formData.imapHost || !formData.imapPort) {
      setError('Email, IMAP host, and port are required');
      return;
    }

    // Require password for new credentials or when updating
    if (!isEditing && !formData.password) {
      setError('Password is required for new credentials');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      // Fix the API endpoint path
      await api.post(`/api/emails/credentials`, formData);

      setSuccessMessage('Email credentials saved successfully');
      resetForm();
      fetchCredentials();
    } catch (error) {
      console.error('Error saving credentials:', error);
      setError(error.response?.data?.message || 'Failed to save email credentials');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to simulate progress for a better user experience
  const simulateProgress = (operation) => {
    const progressMessages = {
      search: [
        'Connecting to email server...',
        'Searching for job applications...',
        'Processing emails...',
        'Extracting job data...',
        'Preparing results...'
      ],
      import: [
        'Starting import process...',
        'Processing new applications...',
        'Updating status changes...',
        'Processing responses...',
        'Finalizing import...'
      ],
      sync: [
        'Connecting to email server...',
        'Searching for job applications...',
        'Processing emails...',
        'Extracting job data...',
        'Importing new applications...',
        'Updating status changes...',
        'Processing responses...',
        'Finalizing sync...'
      ]
    };

    const messages = progressMessages[operation] || progressMessages.search;
    let currentStep = 0;
    setProgressMessage(messages[0]);

    return setInterval(() => {
      if (currentStep < messages.length) {
        setProgressMessage(messages[currentStep]);
        currentStep++;

        // Calculate progress based on steps
        // Leave room at the end for the real progress to take over
        const progress = Math.min(85, 5 + (currentStep * 20));
        setProgress(progress);
      }
    }, 800);
  };

  // Search emails for job applications and status updates
  const searchEmails = async (credentialId) => {
    try {
      setEmailSearchLoading(true);
      setEmailResults(null);
      setItemsToProcess([]);
      setProgress(5);
      setProgressMessage('Connecting to email server...');

      // Start progress simulation
      const progressInterval = simulateProgress('search');

      const credential = credentials.find(cred => cred._id === credentialId);

      if (!credential) {
        setError('Invalid credential selected');
        clearInterval(progressInterval);
        setProgress(0);
        setProgressMessage('');
        return;
      }

      // Fix the API endpoint path - remove the redundant "/api" prefix
      const response = await api.post(`/api/emails/search-with-saved-credentials`, {
        credentialId,
        searchTimeframeDays: credential.searchTimeframeDays,
        searchFolders: credential.searchFolders,
        ignorePreviousImport // Pass the force option to ignore last import time
      });

      // Clear the interval
      clearInterval(progressInterval);

      // Show completion
      setProgress(100);
      setProgressMessage('Search complete!');

      setEmailResults(response.data);

      // Combine all items (applications, status updates, responses) into a single array
      const allItems = [
        ...(response.data.applications || []).map(item => ({ ...item, type: 'application' })),
        ...(response.data.statusUpdates || []).map(item => ({ ...item, type: 'statusUpdate' })),
        ...(response.data.responses || []).map(item => ({ ...item, type: 'response' }))
      ];

      if (allItems.length > 0) {
        setItemsToProcess(allItems);
        // Initially select all non-existing items
        setSelectedItems(allItems.filter(item => !item.exists).map(item => item.id || item._id));
      }

      // Reset progress after a moment
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 1000);
    } catch (error) {
      console.error('Error searching emails:', error);
      setEmailResults({
        success: false,
        message: error.response?.data?.message || 'Error searching emails',
        applications: [],
        statusUpdates: [],
        responses: []
      });
      setProgress(0);
      setProgressMessage('');
    } finally {
      setEmailSearchLoading(false);
    }
  };

  // Import selected items
  const importItems = async () => {
    if (selectedItems.length === 0) return;

    try {
      setImportLoading(true);
      setProgress(10);
      setProgressMessage('Starting import process...');

      // Start progress simulation
      const progressInterval = simulateProgress('import');

      // Filter items to only those selected
      const itemsToImport = itemsToProcess.filter(item =>
        selectedItems.includes(item.id || item._id)
      );

      // Group items by type
      const applications = itemsToImport.filter(item => item.type === 'application');
      const statusUpdates = itemsToImport.filter(item => item.type === 'statusUpdate');
      const responses = itemsToImport.filter(item => item.type === 'response');

      // Fix the API endpoint path
      const response = await api.post(`/api/emails/import-all`, {
        applications,
        statusUpdates,
        responses
      });

      // Clear the interval
      clearInterval(progressInterval);

      // Show completion
      setProgress(100);
      setProgressMessage('Import complete!');

      setEmailResults({
        ...emailResults,
        importMessage: response.data.message,
        importSuccess: true,
        importStats: response.data.stats
      });

      // Clear selected items after successful import
      setSelectedItems([]);

      // If onImportJobs callback exists (to refresh job list in parent component)
      if (onImportJobs) {
        onImportJobs();
      }

      // Reset progress after a moment
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 1000);
    } catch (error) {
      console.error('Error importing items:', error);
      setEmailResults({
        ...emailResults,
        importMessage: error.response?.data?.message || 'Error importing items',
        importSuccess: false
      });
      setProgress(0);
      setProgressMessage('');
    } finally {
      setImportLoading(false);
    }
  };

  // Sync (search + import in one operation)
  const runSync = async (credentialId) => {
    try {
      setEmailSearchLoading(true);
      setEmailResults(null);
      setProgress(5);
      setProgressMessage('Initializing sync operation...');

      // Start progress simulation
      const progressInterval = simulateProgress('sync');

      // Fix the API endpoint path
      const response = await api.post(`/api/emails/sync`, {
        credentialId,
        ignorePreviousImport
      });

      // Clear the interval
      clearInterval(progressInterval);

      // Show completion
      setProgress(100);
      setProgressMessage('Sync complete!');

      setEmailResults({
        success: true,
        message: response.data.message,
        importStats: response.data.stats,
        applications: response.data.applications || [],
        statusUpdates: response.data.statusUpdates || [],
        responses: response.data.responses || []
      });

      // If onImportJobs callback exists (to refresh job list in parent component)
      if (onImportJobs) {
        onImportJobs();
      }

      // Reset progress after a moment
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 1000);
    } catch (error) {
      console.error('Error with sync operation:', error);
      setEmailResults({
        success: false,
        message: error.response?.data?.message || 'Error with sync operation',
        applications: [],
        statusUpdates: [],
        responses: []
      });
      setProgress(0);
      setProgressMessage('');
    } finally {
      setEmailSearchLoading(false);
    }
  };

  // Function to fetch available email folders
  const fetchAvailableFolders = async (credentialId) => {
    try {
      setFoldersLoading(true);
      setError('');

      // Fix the API endpoint path
      const response = await api.post('/api/emails/get-folders', { credentialId });

      if (response.data.folders && response.data.folders.length > 0) {
        setAvailableFolders(response.data.folders);
        setSuccessMessage('Successfully retrieved email folders');
      } else {
        setError('No folders found on the email server');
      }
    } catch (error) {
      console.error('Error fetching email folders:', error);
      setError(error.response?.data?.message || 'Failed to fetch email folders');
    } finally {
      setFoldersLoading(false);
    }
  };

  // Helper to fill in common email providers
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

  // Handle item selection
  const toggleItemSelection = (itemId) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  // Select/deselect all items
  const toggleSelectAll = () => {
    if (selectedItems.length === itemsToProcess.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(itemsToProcess.map(item => item.id || item._id));
    }
  };

  // Helper to render the status badge with appropriate color
  const renderStatusBadge = (item) => {
    if (item.type === 'application') {
      return <span className="badge bg-primary">Application</span>;
    } else if (item.type === 'statusUpdate') {
      return <span className="badge bg-info text-dark">Status Update</span>;
    } else if (item.type === 'response') {
      return (
        <span className={`badge ${
          item.response === 'Rejected' ? 'bg-danger' :
          item.response === 'Interview' ? 'bg-success' :
          item.response === 'Phone Screen' ? 'bg-warning text-dark' :
          'bg-secondary'
        }`}>
          {item.response}
        </span>
      );
    }
    return <span className="badge bg-secondary">Unknown</span>;
  };

  return (
    <div className="email-integration">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Email Integration</h2>
        <Link to="/" className="btn btn-outline-secondary">Back to Dashboard</Link>
      </div>

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
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Credentials' : 'Save Credentials')}
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
                            className="btn btn-sm btn-outline-success"
                            onClick={() => searchEmails(credential._id)}
                            disabled={emailSearchLoading}
                          >
                            Search
                          </button>

                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => runSync(credential._id)}
                            disabled={emailSearchLoading}
                          >
                            Sync
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
                              Force Full Search
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
                <div className="progress" style={{ position: 'relative' }}>
                  <div
                    className="progress-bar progress-bar-striped progress-bar-animated"
                    role="progressbar"
                    style={{ width: `${progress}%` }}
                    aria-valuenow={progress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                  </div>
                  <div className="position-absolute d-flex align-items-center justify-content-center" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
                    <span>{progressMessage}</span>
                  </div>
                </div>
                <div className="text-center mt-2">
                  <small className="text-muted">{progressMessage}</small>
                </div>
              </div>
            </div>
          )}

          {/* Email search results */}
          {emailResults && (
            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Email Integration Results</h5>
                {emailResults.importSuccess && (
                  <Link to="/applications" className="btn btn-sm btn-outline-primary">
                    View Job Applications
                  </Link>
                )}
              </div>
              <div className="card-body">
                <div className={`alert ${emailResults.success ? 'alert-success' : 'alert-danger'}`}>
                  {emailResults.message}
                </div>

                {emailResults.importMessage && (
                  <div className={`alert ${emailResults.importSuccess ? 'alert-success' : 'alert-danger'}`}>
                    {emailResults.importMessage}
                  </div>
                )}

                {emailResults.importStats && (
                  <div className="alert alert-info">
                    <h6>Import Summary:</h6>
                    <ul className="mb-0">
                      <li>New applications: {emailResults.importStats.applications?.added || 0}</li>
                      <li>Status updates processed: {emailResults.importStats.statusUpdates?.processed || 0}</li>
                      <li>Responses processed: {emailResults.importStats.responses?.processed || 0}</li>
                    </ul>
                  </div>
                )}

                {itemsToProcess.length > 0 && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="mb-0">Found {itemsToProcess.length} items:</h6>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={toggleSelectAll}
                      >
                        {selectedItems.length === itemsToProcess.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm table-hover">
                        <thead>
                          <tr>
                            <th>Select</th>
                            <th>Type</th>
                            <th>Job Title</th>
                            <th>Company</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsToProcess.map((item, index) => (
                            <tr key={index} className={item.exists ? "table-secondary" : ""}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedItems.includes(item.id || item._id)}
                                  onChange={() => toggleItemSelection(item.id || item._id)}
                                  disabled={item.exists}
                                />
                              </td>
                              <td>{renderStatusBadge(item)}</td>
                              <td>{item.jobTitle}</td>
                              <td>{item.company}</td>
                              <td>
                                {item.type === 'application' && item.applied ?
                                  new Date(item.applied).toLocaleDateString() :
                                  item.type === 'statusUpdate' && item.statusDate ?
                                  new Date(item.statusDate).toLocaleDateString() :
                                  item.type === 'response' && item.responded ?
                                  new Date(item.responded).toLocaleDateString() :
                                  'Unknown'}
                              </td>
                              <td>
                                {item.exists ? (
                                  <span className="badge bg-secondary">Already Exists</span>
                                ) : (
                                  <span className="badge bg-success">New</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      className="btn btn-primary mt-3"
                      onClick={importItems}
                      disabled={importLoading || selectedItems.length === 0}
                    >
                      {importLoading ? 'Importing...' : (
                        selectedItems.length === 0 ?
                        'Select Items to Import' :
                        `Import ${selectedItems.length} Selected Item${selectedItems.length !== 1 ? 's' : ''}`
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailIntegration;