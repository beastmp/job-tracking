import axios from 'axios';

// Determine the API base URL based on the environment
const API_BASE_URL = process.env.REACT_APP_API_URL ||
                     (window.location.hostname === 'localhost'
                      ? 'http://localhost:5000'
                      : `${window.location.origin}/api`);

// Get API timeout from environment or use default
const API_TIMEOUT = parseInt(process.env.REACT_APP_API_TIMEOUT || '30000', 10);

// Create a pre-configured axios instance with the base URL
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors or server errors
    if (!error.response) {
      console.error('Network error or server not responding');
    }
    return Promise.reject(error);
  }
);

// Export both the configured instance and the base URL
export { api, API_BASE_URL };

// API methods for job applications
export const jobsAPI = {
  getAllJobs: () => api.get('/jobs'),
  getJob: (id) => api.get(`/jobs/${id}`),
  createJob: (jobData) => api.post('/jobs', jobData),
  updateJob: (id, jobData) => api.put(`/jobs/${id}`, jobData),
  deleteJob: (id) => api.delete(`/jobs/${id}`),
  bulkDeleteJobs: (ids) => api.post('/jobs/bulk-delete', { ids }),
  reEnrichJobs: (ids) => api.post('/api/jobs/re-enrich', { ids }),
  getApplicationStats: () => api.get('/jobs/stats')
};

// Export the api instance as the default export
export default api;