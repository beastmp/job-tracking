import React, { useState, useEffect, useRef } from 'react';
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

  // Fetch job data only once when component mounts
  useEffect(() => {
    // Skip if we've already fetched or no ID
    if (initialFetchDone.current || !id) return;

    console.log('Fetching job data for ID:', id);

    const fetchJob = async () => {
      if (!isMounted.current) return;

      try {
        setLoading(true);
        setLoadingMessage('Loading job details...');

        // Adding a debuggable API call
        console.log('Making API request to:', `/jobs/${id}`);
        const response = await api.get(`/jobs/${id}`);
        console.log('API response received:', response);

        if (isMounted.current) {
          console.log('=== FULL JOB OBJECT ===', response.data);
          // Set job data first, then update loading states
          setSelectedJob(response.data);
          setError(null);

          // Important: Ensure these state updates happen after setting the job data
          console.log('Setting loading states to false');
          setIsLoading(false);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted.current) {
          console.error('Error fetching job details:', err);
          console.error('Error response:', err.response);
          console.error('Error message:', err.message);
          setError('Error fetching job details: ' + (err.response?.data?.message || err.message));
          // Make sure to update loading states even on error
          setIsLoading(false);
          setLoading(false);
        }
      } finally {
        if (isMounted.current) {
          initialFetchDone.current = true;
        }
      }
    };

    fetchJob();

  }, [id, setLoading, setLoadingMessage]);

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

  console.log('EditJobPage render state:', { isLoading, selectedJob, error });

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