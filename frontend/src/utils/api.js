import axios from 'axios';

// Get base URL for API from environment variable or default to localhost in development
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create an axios instance for consistent headers and base URL
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add loading handlers (to be used by LoadingContext)
let loadingHandlers = {
  setLoading: () => {}, // Default no-op handlers
  setLoadingMessage: () => {},
  clearLoading: () => {},
};

export const setLoadingHandlers = (handlers) => {
  loadingHandlers = handlers;
};

// Request interceptor to show loading state
api.interceptors.request.use(
  (config) => {
    loadingHandlers.setLoading(true);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to hide loading state
api.interceptors.response.use(
  (response) => {
    loadingHandlers.clearLoading();
    return response;
  },
  (error) => {
    loadingHandlers.clearLoading();
    return Promise.reject(error);
  }
);

// Create a special instance for email processing which might take longer
const emailProcessingApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Longer timeout for email processing requests
  timeout: 300000, // 5 minutes
});

// Export all API methods
const apiService = {
  // Jobs API
  get: (endpoint) => api.get(endpoint),
  post: (endpoint, data) => api.post(endpoint, data),
  put: (endpoint, data) => api.put(endpoint, data),
  delete: (endpoint) => api.delete(endpoint),
  patch: (endpoint, data) => api.patch(endpoint),

  // Job-specific APIs
  getJobs: () => api.get('/jobs'),
  createJob: (jobData) => api.post('/jobs', jobData),
  updateJob: (id, jobData) => api.put(`/jobs/${id}`, jobData),
  deleteJob: (id) => api.delete(`/jobs/${id}`),
  getJob: (id) => api.get(`/jobs/${id}`),
  bulkDeleteJobs: (ids) => api.post('/jobs/bulk-delete', { ids }),
  getJobStats: () => api.get('/jobs/stats'),
  reEnrichJobs: (jobIds) => api.post('/jobs/re-enrich', { jobIds }),
  extractDataFromWebsite: (url) => api.post('/jobs/extract-from-website', { url }),

  // Excel upload API
  uploadExcel: (formData) => api.post('/upload/import-excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),

  // Legacy Email API methods
  searchEmails: (data) => api.post('/emails/search', data),
  importAllItems: (data) => api.post('/emails/import-all', data),
  syncEmailItems: (data) => api.post('/emails/sync', data),
  saveCredentials: (data) => api.post('/emails/credentials', data),
  getCredentials: () => api.get('/emails/credentials'),
  deleteCredentials: (id) => api.delete(`/emails/credentials/${id}`),
  getEnrichmentStatus: () => api.get('/emails/enrichment-status'),

  // New email processing API endpoints
  getActiveJobs: () => api.get('/email-processing/active-jobs'),
  startEmailSearch: (data) => emailProcessingApi.post('/email-processing/search', data),
  startEmailSync: (data) => emailProcessingApi.post('/email-processing/sync', data),
  startEnrichment: () => api.post('/email-processing/enrichment'),
  enrichUrl: (data) => api.post('/email-processing/enrich-url', data),
  getJobDetails: (jobId) => api.get(`/email-processing/job/${jobId}`),
  getEmailProcessingEnrichmentStatus: () => api.get('/email-processing/enrichment-status'),
};

export default apiService;