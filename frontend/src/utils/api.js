import axios from 'axios';

// Get API URL from environment variable, or use relative path in development
const API_URL = process.env.REACT_APP_API_URL || '';

// Function to create API with interceptors for loading states
const createApiInstance = (timeout = 120000) => {
  const instance = axios.create({
    baseURL: API_URL,
    timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || timeout.toString(), 10),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // We'll add the loading interceptors when we configure the instance with setLoadingHandlers
  return instance;
};

// Create axios instances with base URL and default configs
const api = createApiInstance();
export const longRunningApi = createApiInstance(300000); // 5 minutes for email operations

// Track all active requests to manage loading states
let activeRequests = 0;
let loadingHandlers = null;

// Function to add loading handlers to the API instances
export const setLoadingHandlers = (handlers) => {
  if (!handlers) return;

  loadingHandlers = handlers;

  // Add interceptors to both API instances
  const setupInterceptors = (instance) => {
    // Request interceptor
    instance.interceptors.request.use(
      config => {
        // Skip loading indicator if skipGlobalLoading is set
        if (!config.skipGlobalLoading) {
          // Increment the active requests counter
          activeRequests++;

          // If this is the first active request, show the loading indicator
          if (activeRequests === 1 && loadingHandlers.setLoading) {
            loadingHandlers.setLoading(true);
          }
        }

        return config;
      },
      error => {
        // Handle request error
        if (!error.config?.skipGlobalLoading) {
          activeRequests--;
          if (activeRequests === 0 && loadingHandlers.setLoading) {
            loadingHandlers.setLoading(false);
          }
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    instance.interceptors.response.use(
      response => {
        // Skip decrementing if skipGlobalLoading is set
        if (!response.config.skipGlobalLoading) {
          // Decrement the active requests counter
          activeRequests--;

          // If there are no more active requests, hide the loading indicator
          if (activeRequests === 0 && loadingHandlers.setLoading) {
            loadingHandlers.setLoading(false);
          }
        }

        return response;
      },
      error => {
        // Handle response error
        if (!error.config?.skipGlobalLoading) {
          activeRequests--;
          if (activeRequests === 0 && loadingHandlers.setLoading) {
            loadingHandlers.setLoading(false);
          }
        }
        return Promise.reject(error);
      }
    );
  };

  setupInterceptors(api);
  setupInterceptors(longRunningApi);
};

// Manually control loading state (for operations not using the API)
export const manualLoadingStart = (message = '', progress = 0) => {
  if (loadingHandlers && loadingHandlers.setLoading) {
    loadingHandlers.setLoading(true, message, progress);
  }
};

export const manualLoadingUpdate = (message = '', progress = 0) => {
  if (loadingHandlers) {
    if (loadingHandlers.setLoadingMessage) loadingHandlers.setLoadingMessage(message);
    if (loadingHandlers.setLoadingProgress) loadingHandlers.setLoadingProgress(progress);
  }
};

export const manualLoadingEnd = () => {
  if (loadingHandlers && loadingHandlers.setLoading) {
    loadingHandlers.setLoading(false);
  }
};

export default api;

// Export specialized API instances for specific domains
export const jobsAPI = {
  getJobs: () => api.get('/jobs'),
  getJob: (id) => api.get(`/jobs/${id}`),
  createJob: (jobData) => api.post('/jobs', jobData),
  updateJob: (id, jobData) => api.put(`/jobs/${id}`, jobData),
  deleteJob: (id) => api.delete(`/jobs/${id}`),
  bulkDelete: (ids) => api.post('/jobs/bulk-delete', { ids }),
  reEnrichJobs: (ids) => api.post('/jobs/re-enrich', { ids })
};

// Email operations API
export const emailsAPI = {
  // Sync emails with option to skip global loading indicator
  syncEmails: (params) => longRunningApi.post('/emails/sync', params,
    {
      skipGlobalLoading: true,
      timeout: 300000 // Explicitly set timeout to 5 minutes
    }),

  // New background sync function returns a job ID immediately
  syncEmailsBackground: (params) => api.post('/emails/sync-background', params),

  // New background search function returns a job ID immediately
  searchEmailsBackground: (params) => api.post('/emails/search-background', params),

  // Import items in the background after search
  importItemsBackground: (data) => api.post('/emails/import-background', data),

  // Get job status by ID
  getJobStatus: (jobId) => api.get(`/emails/job/${jobId}`),

  getFolders: (credentialId) => api.post('/emails/get-folders', { credentialId }),
  importItems: (data) => api.post('/emails/import-all', data),
  saveCredentials: (data) => api.post('/emails/credentials', data),
  getCredentials: () => api.get('/emails/credentials'),
  deleteCredentials: (id) => api.delete(`/emails/credentials/${id}`),
  getEnrichmentStatus: () => api.get('/emails/enrichment-status')
};