import axios from 'axios';

// Get API URL from environment variable, or use relative path in development
const API_URL = process.env.REACT_APP_API_URL || '';

// Create axios instance with base URL and default configs
const api = axios.create({
  baseURL: API_URL,
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '30000', 10),
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