import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLoading } from '../contexts/LoadingContext';
import api from '../utils/api';

const ViewJobPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
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
        console.log('Received job data:', response.data);

        if (isMounted.current) {
          setJob(response.data);
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

  const handleEdit = () => {
    navigate(`/edit-job/${id}`);
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
  if (!job) {
    return <div className="alert alert-warning">No job found with the given ID.</div>;
  }

  // Format date strings
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="job-view">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>View Job Application</h2>
        <button className="btn btn-primary" onClick={handleEdit}>
          Edit Job
        </button>
      </div>

      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h3 className="mb-0">{job.jobTitle} at {job.company}</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <p><strong>Source:</strong> {job.source || 'N/A'}</p>
              <p><strong>Search Type:</strong> {job.searchType || 'N/A'}</p>
              <p><strong>Application Through:</strong> {job.applicationThrough || 'N/A'}</p>
              <p><strong>Company Location:</strong> {job.companyLocation || 'N/A'}</p>
              <p><strong>Location Type:</strong> {job.locationType || 'N/A'}</p>
              <p><strong>Employment Type:</strong> {job.employmentType || 'N/A'}</p>
            </div>
            <div className="col-md-6">
              <p><strong>Wage Range:</strong> {job.wagesMin ? `${job.wagesMin} - ${job.wagesMax || 'N/A'} (${job.wageType || 'N/A'})` : 'Not specified'}</p>
              <p><strong>Date Applied:</strong> {formatDate(job.applied)}</p>
              <p><strong>Date Responded:</strong> {job.responded ? formatDate(job.responded) : 'No response yet'}</p>
              <p><strong>Response Status:</strong> <span className={job.response === 'Rejected' ? 'text-danger' : (job.response === 'Offer' || job.response === 'Hired' ? 'text-success' : '')}>{job.response || 'No Response'}</span></p>
              <p><strong>External Job ID:</strong> {job.externalJobId || 'N/A'}</p>
              <p>
                <strong>Job Website:</strong> {job.website ? (
                  <a href={job.website} target="_blank" rel="noopener noreferrer">
                    {job.website}
                  </a>
                ) : 'N/A'}
              </p>
            </div>
          </div>

          {job.description && (
            <div className="mt-4">
              <h4>Job Description</h4>
              <div className="p-3 bg-light rounded">
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{job.description}</pre>
              </div>
            </div>
          )}

          {job.notes && (
            <div className="mt-4">
              <h4>Notes</h4>
              <div className="p-3 bg-light rounded">
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{job.notes}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {job.statusChecks && job.statusChecks.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Status Check History</h4>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {job.statusChecks.map((check, index) => (
                  <tr key={index}>
                    <td>{formatDate(check.date)}</td>
                    <td>{check.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewJobPage;