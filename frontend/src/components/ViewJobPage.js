import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useLoading } from '../contexts/LoadingContext';

const ViewJobPage = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const { setLoadingMessage } = useLoading();
  const navigate = useNavigate();
  const [extractionMessage, setExtractionMessage] = useState(null);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoadingMessage('Loading job details...');
        const response = await api.get(`/jobs/${id}`);
        setJob(response.data);
      } catch (err) {
        setError(`Error loading job: ${err.message}`);
      }
    };

    fetchJob();
  }, [id, setLoadingMessage]);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this job application?')) {
      try {
        setLoadingMessage('Deleting job application...');
        await api.delete(`/jobs/${id}`);
        navigate('/applications');
      } catch (err) {
        setError(`Error deleting job: ${err.message}`);
      }
    }
  };

  const handleExtractFromWebsite = async () => {
    if (!job.website) {
      setExtractionMessage({
        type: 'danger',
        text: 'No website URL available for this job'
      });
      return;
    }

    try {
      setExtractionMessage({
        type: 'info',
        text: 'Extracting job data from website...'
      });

      setLoadingMessage('Extracting job data from website...');
      const response = await api.post('/jobs/extract-from-website', {
        url: job.website,
        jobId: job._id
      });

      // Update the job data with the response
      if (response.data && response.data.job) {
        setJob(response.data.job);

        setExtractionMessage({
          type: 'success',
          text: 'Job data successfully extracted and updated!'
        });
      } else {
        setExtractionMessage({
          type: 'warning',
          text: 'Extracted some job data but could not update the job'
        });
      }
    } catch (err) {
      console.error('Error extracting job data:', err);
      setExtractionMessage({
        type: 'danger',
        text: `Error extracting job data: ${err.response?.data?.message || err.message}`
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!job) return <div className="text-center mt-5"><div className="spinner-border" role="status"></div></div>;

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>{job.jobTitle}</h1>
        <div>
          <Link to={`/edit-job/${id}`} className="btn btn-primary me-2">Edit</Link>
          <button onClick={handleDelete} className="btn btn-danger">Delete</button>
        </div>
      </div>

      {extractionMessage && (
        <div className={`alert alert-${extractionMessage.type} mb-4`}>
          {extractionMessage.text}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <h4 className="card-title">Company Details</h4>
              <table className="table table-borderless">
                <tbody>
                  <tr>
                    <th scope="row" style={{width: "40%"}}>Company:</th>
                    <td>{job.company}</td>
                  </tr>
                  <tr>
                    <th scope="row">Location:</th>
                    <td>{job.companyLocation || 'N/A'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Website:</th>
                    <td>
                      {job.website ? (
                        <div className="d-flex align-items-center">
                          <a href={job.website} target="_blank" rel="noopener noreferrer" className="me-2">
                            {job.website}
                          </a>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={handleExtractFromWebsite}
                            title="Extract job data from website"
                          >
                            <i className="bi bi-cloud-download"></i> Extract Data
                          </button>
                        </div>
                      ) : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="col-md-6">
              <h4 className="card-title">Job Details</h4>
              <table className="table table-borderless">
                <tbody>
                  <tr>
                    <th scope="row" style={{width: "40%"}}>Date Applied:</th>
                    <td>{formatDate(job.applied)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Current Status:</th>
                    <td>{job.response || 'No Response'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Last Response:</th>
                    <td>{formatDate(job.responded)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Employment Type:</th>
                    <td>{job.employmentType || 'N/A'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Location Type:</th>
                    <td>{job.locationType || 'N/A'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Salary Range:</th>
                    <td>
                      {job.wagesMin || job.wagesMax ?
                        `$${job.wagesMin ? job.wagesMin : ''}${job.wagesMin && job.wagesMax ? '-' : ''}${job.wagesMax ? job.wagesMax : ''} ${job.wageType || ''}`
                        : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">External Job ID:</th>
                    <td>{job.externalJobId || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {job.description && (
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Job Description</h4>
          </div>
          <div className="card-body">
            <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
          </div>
        </div>
      )}

      {job.notes && (
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Notes</h4>
          </div>
          <div className="card-body">
            <p style={{ whiteSpace: 'pre-wrap' }}>{job.notes}</p>
          </div>
        </div>
      )}

      {job.statusChecks && job.statusChecks.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Status History</h4>
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

      <div className="d-flex justify-content-between mb-4">
        <Link to="/applications" className="btn btn-secondary">Back to Applications</Link>
        <Link to={`/edit-job/${id}`} className="btn btn-primary">Edit</Link>
      </div>
    </div>
  );
};

export default ViewJobPage;