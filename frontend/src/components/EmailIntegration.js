import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { emailsAPI } from '../utils/api';

// Get default configuration from environment variables with fallbacks
const DEFAULT_SEARCH_TIMEFRAME_DAYS = parseInt(process.env.REACT_APP_DEFAULT_SEARCH_TIMEFRAME_DAYS || '90', 10);
const DEFAULT_EMAIL_FOLDERS = ['INBOX'];

const EmailIntegration = ({ onImportJobs, refreshData }) => {
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
  // eslint-disable-next-line no-unused-vars
  const [importLoading, setImportLoading] = useState(false);
  const [itemsToProcess, setItemsToProcess] = useState([]);

  // Progress bar states
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [processingDetails, setProcessingDetails] = useState({
    emailsTotal: 0,
    emailsProcessed: 0,
    foldersTotal: 0,
    foldersProcessed: 0,
    enrichmentTotal: 0,
    enrichmentProcessed: 0
  });

  // Job tracking states
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobPollingInterval, setJobPollingInterval] = useState(null);

  // Selection states
  const [ignorePreviousImport, setIgnorePreviousImport] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Feedback toast for user actions
  const [toastMessage, setToastMessage] = useState(null);

  // Add this state at the top of the component with the other states
  const [enrichmentStatus, setEnrichmentStatus] = useState({ isProcessing: false, queueSize: 0 });

  useEffect(() => {
    fetchCredentials();
  }, []);

  // Toast message auto-hide effect
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Add this effect to periodically check the enrichment status
  useEffect(() => {
    // Get enrichment status once on component mount
    fetchEnrichmentStatus();

    // Set up interval to periodically check status if there are active processes
    const interval = setInterval(() => {
      if (enrichmentStatus.isProcessing || enrichmentStatus.queueSize > 0) {
        fetchEnrichmentStatus();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [enrichmentStatus.isProcessing, enrichmentStatus.queueSize]);

  // Effect to poll for job status if we have an active job
  useEffect(() => {
    if (activeJobId) {
      // Start polling for job updates
      const interval = setInterval(() => {
        pollJobStatus(activeJobId);
      }, 2000); // Check every 2 seconds

      // Save the interval ID so we can clear it later
      setJobPollingInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      // Clear any existing polling interval when there's no active job
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
        setJobPollingInterval(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  // Fetch stored email credentials
  const fetchCredentials = async () => {
    try {
      setFetchLoading(true);
      // Fix the API endpoint path
      const response = await api.get(`/emails/credentials`);
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
        await api.delete(`/emails/credentials/${id}`);
        setToastMessage({
          type: 'success',
          text: 'Credentials deleted successfully'
        });
        fetchCredentials();
      } catch (error) {
        console.error('Error deleting credentials:', error);
        setToastMessage({
          type: 'danger',
          text: 'Failed to delete credentials'
        });
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
      await api.post(`/emails/credentials`, formData);

      setToastMessage({
        type: 'success',
        text: 'Email credentials saved successfully'
      });
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

  // Import selected items
  // const importItems = async () => {
  //   if (selectedItems.length === 0) return;

  //   try {
  //     setImportLoading(true);
  //     setProgress(10);
  //     setProgressMessage('Starting import process...');

  //     // Start progress simulation
  //     const progressInterval = simulateProgress('import');

  //     // Filter items to only those selected
  //     const itemsToImport = itemsToProcess.filter(item =>
  //       selectedItems.includes(item.id || item._id)
  //     );

  //     // Group items by type
  //     const applications = itemsToImport.filter(item => item.type === 'application');
  //     const statusUpdates = itemsToImport.filter(item => item.type === 'statusUpdate');
  //     const responses = itemsToImport.filter(item => item.type === 'response');

  //     // Optimistic UI update - show preview of what will be changed
  //     setToastMessage({
  //       type: 'info',
  //       text: `Importing ${applications.length} new applications, ${statusUpdates.length} status updates, and ${responses.length} responses...`
  //     });

  //     // Fix the API endpoint path
  //     const response = await api.post(`/emails/import-all`, {
  //       applications,
  //       statusUpdates,
  //       responses
  //     });

  //     // Clear the interval
  //     clearInterval(progressInterval);

  //     // Show completion
  //     setProgress(100);
  //     setProgressMessage('Import complete!');

  //     setEmailResults({
  //       ...emailResults,
  //       importMessage: response.data.message,
  //       importSuccess: true,
  //       importStats: response.data.stats
  //     });

  //     // Clear selected items after successful import
  //     setSelectedItems([]);

  //     // Show success toast
  //     setToastMessage({
  //       type: 'success',
  //       text: `Successfully imported ${response.data.stats.applications?.added || 0} applications, ${response.data.stats.statusUpdates?.processed || 0} status updates, and ${response.data.stats.responses?.processed || 0} responses!`
  //     });

  //     // Use refreshData function from props if available, otherwise use legacy method
  //     if (refreshData) {
  //       refreshData();
  //     } else if (onImportJobs) {
  //       onImportJobs();
  //     }

  //     // Reset progress after a moment
  //     setTimeout(() => {
  //       setProgress(0);
  //       setProgressMessage('');
  //     }, 1000);
  //   } catch (error) {
  //     console.error('Error importing items:', error);
  //     setEmailResults({
  //       ...emailResults,
  //       importMessage: error.response?.data?.message || 'Error importing items',
  //       importSuccess: false
  //     });
  //     setProgress(0);
  //     setProgressMessage('');

  //     // Show error toast
  //     setToastMessage({
  //       type: 'danger',
  //       text: error.response?.data?.message || 'Error importing items'
  //     });
  //   } finally {
  //     setImportLoading(false);
  //   }
  // };

  // // Sync (search + import in one operation)
  // const runSync = async (credentialId) => {
  //   try {
  //     setEmailSearchLoading(true);
  //     setEmailResults(null);
  //     setProgress(5);
  //     setProgressMessage('Initializing sync operation...');
  //     // Reset processing details when starting a new sync
  //     setProcessingDetails({
  //       emailsTotal: 0,
  //       emailsProcessed: 0,
  //       foldersTotal: 0,
  //       foldersProcessed: 0,
  //       enrichmentTotal: 0,
  //       enrichmentProcessed: 0
  //     });

  //     // Start progress simulation
  //     const progressInterval = simulateProgress('sync');

  //     // Show optimistic UI update
  //     setToastMessage({
  //       type: 'info',
  //       text: 'Sync operation started - searching and importing job data automatically...'
  //     });

  //     // Use the emailsAPI with longer timeout for this operation
  //     const response = await emailsAPI.syncEmails({
  //       credentialId,
  //       ignorePreviousImport,
  //       // Add a progress callback to update processing details
  //       onProgress: (progressData) => {
  //         if (progressData) {
  //           setProcessingDetails(prevDetails => ({
  //             ...prevDetails,
  //             emailsTotal: progressData.emailsTotal || prevDetails.emailsTotal,
  //             emailsProcessed: progressData.emailsProcessed || prevDetails.emailsProcessed,
  //             foldersTotal: progressData.foldersTotal || prevDetails.foldersTotal,
  //             foldersProcessed: progressData.foldersProcessed || prevDetails.foldersProcessed,
  //             enrichmentTotal: progressData.enrichmentTotal || prevDetails.enrichmentTotal,
  //             enrichmentProcessed: progressData.enrichmentProcessed || prevDetails.enrichmentProcessed
  //           }));

  //           // Update progress percentage based on folder and email processing
  //           if (progressData.foldersTotal > 0) {
  //             const folderProgress = Math.round((progressData.foldersProcessed / progressData.foldersTotal) * 50);
  //             setProgress(Math.min(5 + folderProgress, 55));
  //           }

  //           if (progressData.emailsTotal > 0) {
  //             const emailProgress = Math.round((progressData.emailsProcessed / progressData.emailsTotal) * 40);
  //             setProgress(Math.min(55 + emailProgress, 95));
  //           }
  //         }
  //       }
  //     });

  //     // Clear the interval
  //     clearInterval(progressInterval);

  //     // Show completion
  //     setProgress(100);
  //     setProgressMessage('Sync complete!');

  //     // Combine all items for processing in the UI
  //     const allItems = [
  //       ...(response.data.applications || []).map(app => ({ ...app, type: 'application' })),
  //       ...(response.data.statusUpdates || []).map(update => ({ ...update, type: 'statusUpdate' })),
  //       ...(response.data.responses || []).map(resp => ({ ...resp, type: 'response' }))
  //     ];

  //     // Update the items to process state
  //     setItemsToProcess(allItems);

  //     // Auto-select new items for potential import
  //     const newItemIds = allItems
  //       .filter(item => !item.exists)
  //       .map(item => item.id || item._id);
  //     setSelectedItems(newItemIds);

  //     setEmailResults({
  //       success: true,
  //       message: response.data.message,
  //       importStats: response.data.stats,
  //       applications: response.data.applications || [],
  //       statusUpdates: response.data.statusUpdates || [],
  //       responses: response.data.responses || []
  //     });

  //     // Show success toast
  //     setToastMessage({
  //       type: 'success',
  //       text: response.data.message
  //     });

  //     // Use refreshData function from props if available, otherwise use legacy method
  //     if (refreshData) {
  //       refreshData();
  //     } else if (onImportJobs) {
  //       onImportJobs();
  //     }

  //     // Reset progress after a moment
  //     setTimeout(() => {
  //       setProgress(0);
  //       setProgressMessage('');
  //     }, 1000);
  //   } catch (error) {
  //     console.error('Error with sync operation:', error);
  //     setEmailResults({
  //       success: false,
  //       message: error.message || 'Error with sync operation: The operation timed out. Try again with fewer folders or a shorter time period.',
  //       applications: [],
  //       statusUpdates: [],
  //       responses: []
  //     });
  //     setProgress(0);
  //     setProgressMessage('');

  //     // Show error toast
  //     setToastMessage({
  //       type: 'danger',
  //       text: error.message || 'Error with sync operation'
  //     });
  //   } finally {
  //     setEmailSearchLoading(false);
  //   }
  // };

  // Function to fetch available email folders
  const fetchAvailableFolders = async (credentialId) => {
    try {
      setFoldersLoading(true);
      setError('');

      // Fix the API endpoint path
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

  // Add this function to fetch the enrichment status
  const fetchEnrichmentStatus = async () => {
    try {
      const response = await emailsAPI.getEnrichmentStatus();
      if (response.data.success) {
        setEnrichmentStatus(response.data.status);
      }
    } catch (error) {
      console.error("Error fetching enrichment status:", error);
    }
  };

  // Poll for job status updates
  const pollJobStatus = async (jobId) => {
    if (!jobId) return;

    try {
      const response = await emailsAPI.getJobStatus(jobId);
      const job = response.data.job;

      if (!job) {
        // Job not found, stop polling
        setActiveJobId(null);
        return;
      }

      // Update progress based on job status
      if (job.status === 'processing') {
        // Update progress bar
        setProgress(job.progress || 10);
        if (job.message) setProgressMessage(job.message);

        // If there are processing details in the job, update them
        if (job.updates && job.updates.length > 0) {
          // Get the latest update
          const latestUpdate = job.updates[job.updates.length - 1];
          if (latestUpdate.message) {
            setProgressMessage(latestUpdate.message);
          }
        }
      }
      else if (job.status === 'completed') {
        // Job completed successfully
        setProgress(100);
        setProgressMessage('Operation completed successfully!');

        // Extract the results
        if (job.result) {
          // Handle search results
          if (job.type === 'email_search') {
            // Process search results
            handleSearchResults(job.result);
          }
          // Handle import results
          else if (job.type === 'email_import') {
            handleImportResults(job.result);
          }
          // Handle sync results (combined search + import)
          else if (job.type === 'email_sync') {
            handleSyncResults(job.result);
          }
        }

        // Stop polling
        setActiveJobId(null);

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
        setImportLoading(false);

        // Show error message
        setToastMessage({
          type: 'danger',
          text: job.error || 'Operation failed'
        });

        // Set email results with failure info
        setEmailResults({
          success: false,
          message: job.error || 'The operation failed. Please try again later.',
          applications: [],
          statusUpdates: [],
          responses: []
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

  // Handle search results from background job
  const handleSearchResults = (result) => {
    setEmailSearchLoading(false);

    // Combine all items for processing in the UI
    const allItems = [
      ...(result.applications || []).map(app => ({ ...app, type: 'application', id: app._id || app.id })),
      ...(result.statusUpdates || []).map(update => ({ ...update, type: 'statusUpdate', id: update._id || update.id })),
      ...(result.responses || []).map(resp => ({ ...resp, type: 'response', id: resp._id || resp.id }))
    ];

    // Update the items to process state
    setItemsToProcess(allItems);

    // Auto-select new items for potential import
    const newItemIds = allItems
      .filter(item => !item.exists)
      .map(item => item.id || item._id);
    setSelectedItems(newItemIds);

    // Update processing statistics if available
    if (result.processingStats) {
      setProcessingDetails(result.processingStats);
    }

    // Set email results for display
    setEmailResults({
      success: true,
      message: result.message || `Found ${allItems.length} items`,
      stats: result.stats,
      applications: result.applications || [],
      statusUpdates: result.statusUpdates || [],
      responses: result.responses || [],
      pendingEnrichments: result.pendingEnrichments || 0
    });

    // Show success toast if we have items
    if (allItems.length > 0) {
      setToastMessage({
        type: 'success',
        text: `Found ${result.stats?.total || allItems.length} items (${result.stats?.new || 0} new)`
      });
    } else {
      setToastMessage({
        type: 'info',
        text: 'No new job-related emails were found'
      });
    }
  };

  // Handle import results from background job
  const handleImportResults = (result) => {
    setImportLoading(false);

    // Update email results with import success info
    setEmailResults({
      ...emailResults,
      importMessage: result.message || 'Items imported successfully',
      importSuccess: true,
      importStats: result.stats
    });

    // Show success toast
    setToastMessage({
      type: 'success',
      text: `Successfully imported ${result.stats?.applications?.added || 0} applications, ${result.stats?.statusUpdates?.processed || 0} status updates, and ${result.stats?.responses?.processed || 0} responses!`
    });

    // Clear selected items after successful import
    setSelectedItems([]);

    // Refresh the jobs data
    if (refreshData) {
      refreshData();
    } else if (onImportJobs) {
      onImportJobs();
    }
  };

  // Handle sync results from background job
  const handleSyncResults = (result) => {
    setEmailSearchLoading(false);

    // Combine both search and import results
    handleSearchResults(result);
    handleImportResults(result);
  };

  // Start a background email search
  // const runBackgroundSearch = async (credentialId) => {
  //   try {
  //     setEmailSearchLoading(true);
  //     setEmailResults(null);
  //     setProgress(5);
  //     setProgressMessage('Initializing search operation...');

  //     // Reset processing details
  //     setProcessingDetails({
  //       emailsTotal: 0,
  //       emailsProcessed: 0,
  //       foldersTotal: 0,
  //       foldersProcessed: 0,
  //       enrichmentTotal: 0,
  //       enrichmentProcessed: 0
  //     });

  //     // Start progress simulation
  //     const progressInterval = simulateProgress('search');

  //     // Show optimistic UI update
  //     setToastMessage({
  //       type: 'info',
  //       text: 'Email search started in the background...'
  //     });

  //     // Start the background search job
  //     const response = await emailsAPI.searchEmailsBackground({
  //       credentialId,
  //       ignorePreviousImport
  //     });

  //     // Clear progress simulation
  //     clearInterval(progressInterval);

  //     // Set the active job ID for polling
  //     setActiveJobId(response.data.jobId);

  //   } catch (error) {
  //     console.error('Error starting background search:', error);
  //     setEmailSearchLoading(false);
  //     setProgress(0);
  //     setProgressMessage('');

  //     // Show error toast
  //     setToastMessage({
  //       type: 'danger',
  //       text: error.response?.data?.message || 'Error starting background search'
  //     });
  //   }
  // };

  // Import items using background job
  // const importItemsBackground = async () => {
  //   if (selectedItems.length === 0) return;

  //   try {
  //     setImportLoading(true);
  //     setProgress(10);
  //     setProgressMessage('Starting import process...');

  //     // Start progress simulation
  //     const progressInterval = simulateProgress('import');

  //     // Filter items to only those selected
  //     const itemsToImport = itemsToProcess.filter(item =>
  //       selectedItems.includes(item.id || item._id)
  //     );

  //     // Group items by type
  //     const applications = itemsToImport.filter(item => item.type === 'application');
  //     const statusUpdates = itemsToImport.filter(item => item.type === 'statusUpdate');
  //     const responses = itemsToImport.filter(item => item.type === 'response');

  //     // Optimistic UI update
  //     setToastMessage({
  //       type: 'info',
  //       text: `Starting import of ${applications.length} applications, ${statusUpdates.length} status updates, and ${responses.length} responses...`
  //     });

  //     // Start the background import job
  //     const response = await emailsAPI.importItemsBackground({
  //       applications,
  //       statusUpdates,
  //       responses
  //     });

  //     // Clear progress simulation
  //     clearInterval(progressInterval);

  //     // Set the active job ID for polling
  //     setActiveJobId(response.data.jobId);

  //   } catch (error) {
  //     console.error('Error starting background import:', error);
  //     setImportLoading(false);
  //     setProgress(0);
  //     setProgressMessage('');

  //     // Show error toast
  //     setToastMessage({
  //       type: 'danger',
  //       text: error.response?.data?.message || 'Error importing items'
  //     });
  //   }
  // };

  // Start a background sync operation (search + import)
  const runBackgroundSync = async (credentialId) => {
    try {
      setEmailSearchLoading(true);
      setEmailResults(null);
      setProgress(5);
      setProgressMessage('Initializing sync operation...');

      // Reset processing details
      setProcessingDetails({
        emailsTotal: 0,
        emailsProcessed: 0,
        foldersTotal: 0,
        foldersProcessed: 0,
        enrichmentTotal: 0,
        enrichmentProcessed: 0
      });

      // Start progress simulation
      const progressInterval = simulateProgress('sync');

      // Show optimistic UI update
      setToastMessage({
        type: 'info',
        text: 'Email sync started in the background - this will search and import job data automatically...'
      });

      // Start the background sync job
      const response = await emailsAPI.syncEmailsBackground({
        credentialId,
        ignorePreviousImport
      });

      // Clear progress simulation
      clearInterval(progressInterval);

      // Set the active job ID for polling
      setActiveJobId(response.data.jobId);

    } catch (error) {
      console.error('Error starting background sync:', error);
      setEmailSearchLoading(false);
      setProgress(0);
      setProgressMessage('');

      // Show error toast
      setToastMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Error syncing emails'
      });
    }
  };

  return (
    <div className="email-integration">
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
                            className="btn btn-sm btn-success"
                            onClick={() => runBackgroundSync(credential._id)}
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

                {/* Batch processing details */}
                {(processingDetails.foldersTotal > 0 || processingDetails.emailsTotal > 0 || processingDetails.enrichmentTotal > 0) && (
                  <div className="mt-3">
                    <h6 className="text-muted">Processing Details:</h6>
                    <div className="small">
                      {processingDetails.foldersTotal > 0 && (
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <div>Email Folders:</div>
                          <div>{processingDetails.foldersProcessed} / {processingDetails.foldersTotal}</div>
                        </div>
                      )}

                      {processingDetails.emailsTotal > 0 && (
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <div>Emails Processed:</div>
                          <div>{processingDetails.emailsProcessed} / {processingDetails.emailsTotal}</div>
                        </div>
                      )}

                      {processingDetails.enrichmentTotal > 0 && (
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <div>LinkedIn Enrichments:</div>
                          <div>{processingDetails.enrichmentProcessed} / {processingDetails.enrichmentTotal}</div>
                        </div>
                      )}

                      {emailResults?.pendingEnrichments > 0 && (
                        <div className="alert alert-info mt-2 mb-0 p-2 small">
                          <i className="bi bi-info-circle me-1"></i>
                          {emailResults.pendingEnrichments} job listings will be enriched in the background.
                          This data will be available next time you search.
                        </div>
                      )}
                    </div>
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
                      style={{ width: `${Math.min(100, (100 * (1 - enrichmentStatus.queueSize / (enrichmentStatus.queueSize + 1))))}%` }}
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

                    <div className="alert alert-info mt-3">
                      <i className="bi bi-info-circle me-2"></i>
                      To import these items, please run a new <strong>Sync &amp; Import</strong> operation.
                      The sync process combines both searching and importing into a single step.
                    </div>
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