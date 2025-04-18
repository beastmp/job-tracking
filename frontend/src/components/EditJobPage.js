import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLoading } from '../contexts/LoadingContext';
import JobFormPage from './JobFormPage';
import api from '../utils/api';

const EditJobPage = () => {
  const { id } = useParams();
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { setLoading } = useLoading();

  // Simple effect to fetch job data once
  useEffect(() => {
    let isMounted = true; // Track if component is still mounted

    const fetchJob = async () => {
      console.log('Fetching job with ID:', id);

      try {
        // Show global loading indicator
        setLoading(true);

        // Make API request
        const response = await api.get(`/jobs/${id}`);
        console.log('Job data received:', response.data);

        // Only update state if component is still mounted
        if (isMounted) {
          setSelectedJob(response.data);
          setPageLoading(false);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching job:', err);
        if (isMounted) {
          setError(`Error loading job: ${err.message}`);
          setPageLoading(false);
          setLoading(false);
        }
      }
    };

    fetchJob();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [id, setLoading]); // Only re-run if ID changes

  // Handle job updates
  const handleUpdateJob = async (jobData) => {
    try {
      setLoading(true);
      await api.put(`/jobs/${jobData._id}`, jobData);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Error updating job:', err);
      setError(`Failed to update job: ${err.message}`);
      setLoading(false);
      return false;
    }
  };

  // Loading state
  if (pageLoading) {
    return (
      <div className="text-center mt-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="mt-2">Loading job details...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  // No job data found
  if (!selectedJob) {
    return <div className="alert alert-warning">No job found with the given ID.</div>;
  }

  // Render job form with data
  return <JobFormPage job={selectedJob} onSubmit={handleUpdateJob} isEditing={true} />;
};

export default EditJobPage;