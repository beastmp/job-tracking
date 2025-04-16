import axios from 'axios';

// Get API URL from environment variable, or use relative path in development
const API_URL = process.env.REACT_APP_API_URL || '';

// Create axios instance with base URL and default configs
const api = axios.create({
  baseURL: API_URL,
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '120000', 10), // Increase timeout to 2 minutes
  headers: {
    'Content-Type': 'application/json'
  }
});

// Create a special instance with longer timeout for email operations
export const longRunningApi = axios.create({
  baseURL: API_URL,
  timeout: 300000, // 5 minutes for email operations
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;

// Export specialized API instances for specific domains
export const jobsAPI = {
  getJobs: () => api.get('/api/jobs'),
  getJob: (id) => api.get(`/api/jobs/${id}`),
  createJob: (jobData) => api.post('/api/jobs', jobData),
  updateJob: (id, jobData) => api.put(`/api/jobs/${id}`),
  deleteJob: (id) => api.delete(`/api/jobs/${id}`),
  bulkDelete: (ids) => api.post('/api/jobs/bulk-delete', { ids }),
  reEnrichJobs: (ids) => api.post('/api/jobs/re-enrich', { ids })
};

// Email operations API
export const emailsAPI = {
  searchEmails: (params) => longRunningApi.post('/api/emails/search-with-saved-credentials', params),
  getFolders: (credentialId) => api.post('/api/emails/get-folders', { credentialId }),
  importItems: (data) => api.post('/api/emails/import-all', data),
  syncEmails: (params) => longRunningApi.post('/api/emails/sync', params),
  saveCredentials: (data) => api.post('/api/emails/credentials', data),
  getCredentials: () => api.get('/api/emails/credentials'),
  deleteCredentials: (id) => api.delete(`/api/emails/credentials/${id}`)
};