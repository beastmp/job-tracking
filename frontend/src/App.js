import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import api, { setLoadingHandlers } from './utils/api';
import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import LoadingIndicator from './components/LoadingIndicator';

// Import page components
import Dashboard from './components/Dashboard';
import ApplicationsPage from './components/ApplicationsPage';
import JobFormPage from './components/JobFormPage';
import EditJobPage from './components/EditJobPage';
import ViewJobPage from './components/ViewJobPage';
import ExcelUploadPage from './components/ExcelUploadPage';
import EmailIntegration from './components/EmailIntegration';
import NotFoundPage from './components/NotFoundPage';

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

function AppMain() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { setLoadingMessage } = useLoading();

  // Define fetchJobs with useCallback to ensure stable reference between renders
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      // Show loading for short operations but with a minimal message
      setLoadingMessage('Loading job data...');
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
      await api.post('/jobs', jobData);
      refreshData(); // Refresh instead of redirecting
      return true;
    } catch (err) {
      setError('Error adding job: ' + err.message);
      return false;
    }
  };

  // Delete a job - improved to use refreshData
  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job application?')) {
      try {
        setLoadingMessage('Deleting job application...');
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
      await api.put(`/jobs/${jobId}`, { response: newStatus });
      refreshData();
      return true;
    } catch (err) {
      setError('Error updating status: ' + err.message);
      return false;
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
                  refreshData={refreshData}
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
                  refreshData={refreshData}
                />
              )
            } />

            <Route path="/add-job" element={
              <JobFormPage onSubmit={handleAddJob} isEditing={false} />
            } />

            <Route path="/view-job/:id" element={
              <ViewJobPage />
            } />

            <Route path="/edit-job/:id" element={
              <EditJobPage />
            } />

            <Route path="/upload-excel" element={
              <ExcelUploadPage onImportJobs={refreshData} />
            } />

            <Route path="/email-integration" element={
              <EmailIntegration
                onImportJobs={refreshData}
                refreshData={refreshData}
              />
            } />

            {/* Catch-all route for 404 errors */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default AppWithLoadingContext;
