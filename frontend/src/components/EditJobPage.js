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

  // Fetch a single job for editing - use useCallback with minimal dependencies
  const fetchJob = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true, 'Loading job details...');
      const response = await api.get(`/jobs/${id}`);
      setSelectedJob(response.data);
      setError(null);
      return response.data;
    } catch (err) {
      setError('Error fetching job details: ' + (err.response?.data?.message || err.message));
      return null;
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  }, [id, setLoading]);

  // Update a job
  const handleUpdateJob = async (jobData) => {
    try {
      setLoadingMessage('Updating job application...');
      setLoading(true);
      await api.put(`/jobs/${jobData._id}`, jobData);
      setLoading(false);
      return true;
    } catch (err) {
      setError('Error updating job: ' + (err.response?.data?.message || err.message));
      setLoading(false);
      return false;
    }
  };

  // Only fetch on mount and when ID changes
  useEffect(() => {
    fetchJob();
  }, [fetchJob]); // fetchJob has id in its dependency list

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