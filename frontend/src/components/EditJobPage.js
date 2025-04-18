import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useLoading } from '../contexts/LoadingContext';
import JobFormPage from './JobFormPage';
import api from '../utils/api';

const EditJobPage = () => {
  const { id } = useParams();
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setLoading, setLoadingMessage } = useLoading();

  // Fetch a single job for editing - memoized with useCallback
  const fetchJob = useCallback(async (jobId) => {
    try {
      setLoading(true, 'Loading job details...');
      const response = await api.get(`/jobs/${jobId}`);
      setSelectedJob(response.data);
      setLoading(false);
      return response.data;
    } catch (err) {
      setError('Error fetching job details: ' + err.message);
      setLoading(false);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [setLoading, setError]);

  // Update a job
  const handleUpdateJob = async (jobData) => {
    try {
      setLoadingMessage('Updating job application...');
      await api.put(`/jobs/${jobData._id}`, jobData);
      return true;
    } catch (err) {
      setError('Error updating job: ' + err.message);
      return false;
    }
  };

  useEffect(() => {
    if (id) {
      fetchJob(id);
    }
  }, [id, fetchJob]);

  if (isLoading) {
    return (
      <div className="text-center mt-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return error ? (
    <div className="alert alert-danger">{error}</div>
  ) : selectedJob ? (
    <JobFormPage job={selectedJob} onSubmit={handleUpdateJob} isEditing={true} />
  ) : (
    <div className="alert alert-danger">
      Failed to load job details. Please try again.
    </div>
  );
};

export default EditJobPage;