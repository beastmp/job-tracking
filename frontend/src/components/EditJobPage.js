import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLoading } from '../contexts/LoadingContext';
import JobFormPage from './JobFormPage';
import api from '../utils/api';

const EditJobPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { setLoading } = useLoading();

  // Use ref to track if we've already fetched data
  const hasFetched = useRef(false);
  // Use ref to track component mount status
  const isMounted = useRef(true);

  // Handle component unmounting
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch job data only once
  useEffect(() => {
    // Prevent duplicate fetches with ref
    if (hasFetched.current) {
      return;
    }

    console.log('Setting up fetch for job ID:', id);
    hasFetched.current = true;

    const fetchJob = async () => {
      try {
        console.log('Fetching job data...');
        if (!isMounted.current) return;

        setLoading(true);
        const response = await api.get(`/jobs/${id}`);
        console.log('Received job data');

        if (isMounted.current) {
          setSelectedJob(response.data);
          setPageLoading(false);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching job:', err);
        if (isMounted.current) {
          setError(`Error loading job: ${err.message}`);
          setPageLoading(false);
          setLoading(false);
        }
      }
    };

    fetchJob();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id

  // Handle job updates
  const handleUpdateJob = async (jobData) => {
    try {
      setLoading(true);
      await api.put(`/jobs/${jobData._id}`, jobData);
      setLoading(false);
      // Navigate to the view page after successful update
      navigate(`/view-job/${id}`);
      return true;
    } catch (err) {
      console.error('Error updating job:', err);
      setError(`Failed to update job: ${err.message}`);
      setLoading(false);
      return false;
    }
  };

  const handleViewJob = () => {
    navigate(`/view-job/${id}`);
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

  // Render job form with data and action buttons
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Edit Job Application</h2>
        <button className="btn btn-secondary" onClick={handleViewJob}>
          Back to View
        </button>
      </div>
      <JobFormPage job={selectedJob} onSubmit={handleUpdateJob} isEditing={true} />
    </div>
  );
};

export default EditJobPage;