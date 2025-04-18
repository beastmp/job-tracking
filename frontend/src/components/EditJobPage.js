import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Use refs to track if component is mounted
  const isMounted = useRef(true);
  // Track if the initial fetch has happened
  const initialFetchDone = useRef(false);

  // Clean up function to prevent state updates after unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Create a stable fetch function with useCallback
  const fetchJob = useCallback(async () => {
    if (!isMounted.current || !id || initialFetchDone.current) return;

    console.log('[FETCH] Starting fetch for job ID:', id);
    initialFetchDone.current = true; // Mark as fetched immediately to prevent duplicate calls

    try {
      setLoading(true);
      setLoadingMessage('Loading job details...');

      console.log('[FETCH] Making API request to:', `/jobs/${id}`);
      const response = await api.get(`/jobs/${id}`);
      console.log('[FETCH] API response received:', response);

      if (isMounted.current) {
        console.log('[FETCH] Setting job data:', response.data._id);
        setSelectedJob(response.data);
        setError(null);

        // Set loading states to false
        console.log('[FETCH] Setting loading states to false');
        setIsLoading(false);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        console.error('[FETCH] Error fetching job details:', err);
        setError('Error fetching job details: ' + (err.response?.data?.message || err.message));
        setIsLoading(false);
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on the id

  // Fetch job data only once when component mounts
  useEffect(() => {
    fetchJob();
    // No dependencies on context functions, only on the fetchJob callback
  }, [fetchJob]);

  // Update a job
  const handleUpdateJob = async (jobData) => {
    if (!isMounted.current) return false;

    try {
      console.log('=== UPDATING JOB OBJECT ===', jobData);
      setLoadingMessage('Updating job application...');
      setLoading(true);
      await api.put(`/jobs/${jobData._id}`, jobData);

      if (isMounted.current) {
        setLoading(false);
      }
      return true;
    } catch (err) {
      if (isMounted.current) {
        console.error('Error updating job:', err);
        setError('Error updating job: ' + (err.response?.data?.message || err.message));
        setLoading(false);
      }
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="text-center mt-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="mt-2">Loading job details...</div>
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