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

    const fetchJob = async () => {
      if (!isMounted.current) return;

      try {
        setLoading(true, 'Loading job details...');
        const response = await api.get(`/jobs/${id}`);

        if (isMounted.current) {
          // Add console.log to display the complete job object
          console.log('=== FULL JOB OBJECT ===', response.data);
          setSelectedJob(response.data);
          setError(null);
        }
      } catch (err) {
        if (isMounted.current) {
          console.error('Error fetching job details:', err);
          setError('Error fetching job details: ' + (err.response?.data?.message || err.message));
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setIsLoading(false);
          initialFetchDone.current = true;
        }
      }
    };

    fetchJob();

  }, [id, setLoading]); // Only depend on id and setLoading

  // Update a job
  const handleUpdateJob = async (jobData) => {
    if (!isMounted.current) return false;

    try {
      // Also log the job data being sent for update
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