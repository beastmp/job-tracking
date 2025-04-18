import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useLoading } from '../contexts/LoadingContext';

const EditJobPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setLoadingMessage } = useLoading();
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    company: '',
    companyLocation: '',
    jobTitle: '',
    website: '',
    applied: '',
    response: 'No Response',
    employmentType: '',
    locationType: '',
    wagesMin: '',
    wagesMax: '',
    wageType: '',
    description: '',
    notes: '',
    externalJobId: ''
  });

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoadingMessage('Loading job details...');
        const response = await api.get(`/jobs/${id}`);
        const job = response.data;

        // Format date field for input element (YYYY-MM-DD)
        const formatDate = (dateString) => {
          if (!dateString) return '';
          const date = new Date(dateString);
          return date.toISOString().split('T')[0];
        };

        setFormData({
          company: job.company || '',
          companyLocation: job.companyLocation || '',
          jobTitle: job.jobTitle || '',
          website: job.website || '',
          applied: formatDate(job.applied),
          response: job.response || 'No Response',
          employmentType: job.employmentType || '',
          locationType: job.locationType || '',
          wagesMin: job.wagesMin || '',
          wagesMax: job.wagesMax || '',
          wageType: job.wageType || '',
          description: job.description || '',
          notes: job.notes || '',
          externalJobId: job.externalJobId || ''
        });
      } catch (err) {
        setError(`Error loading job: ${err.message}`);
      }
    };

    fetchJob();
  }, [id, setLoadingMessage]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoadingMessage('Saving changes...');
      await api.put(`/jobs/${id}`, formData);
      navigate(`/view-job/${id}`);
    } catch (err) {
      setError(`Error updating job: ${err.message}`);
      window.scrollTo(0, 0);
    }
  };

  const addStatusCheck = () => {
    navigate(`/view-job/${id}`);
  };

  // Define the available options for dropdown fields
  const responseOptions = [
    'No Response', 'Rejected', 'Phone Screen', 'Interview', 'Offer', 'Hired', 'Other'
  ];

  const employmentTypeOptions = [
    'Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', 'Other'
  ];

  const locationTypeOptions = [
    'Remote', 'On-site', 'Hybrid', 'Other'
  ];

  const wageTypeOptions = [
    'Hourly', 'Salary', 'Yearly', 'Monthly', 'Weekly', 'Project', 'Other'
  ];

  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Edit Job Application</h1>
        <Link to={`/view-job/${id}`} className="btn btn-outline-secondary">Cancel</Link>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Company Information</h4>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="company" className="form-label">Company Name *</label>
                <input
                  type="text"
                  className="form-control"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="companyLocation" className="form-label">Company Location</label>
                <input
                  type="text"
                  className="form-control"
                  id="companyLocation"
                  name="companyLocation"
                  value={formData.companyLocation}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-12 mb-3">
                <label htmlFor="website" className="form-label">Website URL</label>
                <input
                  type="url"
                  className="form-control"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Job Details</h4>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="jobTitle" className="form-label">Job Title *</label>
                <input
                  type="text"
                  className="form-control"
                  id="jobTitle"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="applied" className="form-label">Date Applied</label>
                <input
                  type="date"
                  className="form-control"
                  id="applied"
                  name="applied"
                  value={formData.applied}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="employmentType" className="form-label">Employment Type</label>
                <select
                  className="form-select"
                  id="employmentType"
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={handleChange}
                >
                  <option value="">Select employment type</option>
                  {employmentTypeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="locationType" className="form-label">Location Type</label>
                <select
                  className="form-select"
                  id="locationType"
                  name="locationType"
                  value={formData.locationType}
                  onChange={handleChange}
                >
                  <option value="">Select location type</option>
                  {locationTypeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-3 mb-3">
                <label htmlFor="wagesMin" className="form-label">Minimum Salary</label>
                <input
                  type="number"
                  className="form-control"
                  id="wagesMin"
                  name="wagesMin"
                  value={formData.wagesMin}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-3 mb-3">
                <label htmlFor="wagesMax" className="form-label">Maximum Salary</label>
                <input
                  type="number"
                  className="form-control"
                  id="wagesMax"
                  name="wagesMax"
                  value={formData.wagesMax}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="wageType" className="form-label">Wage Type</label>
                <select
                  className="form-select"
                  id="wageType"
                  name="wageType"
                  value={formData.wageType}
                  onChange={handleChange}
                >
                  <option value="">Select wage type</option>
                  {wageTypeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="externalJobId" className="form-label">External Job ID</label>
                <input
                  type="text"
                  className="form-control"
                  id="externalJobId"
                  name="externalJobId"
                  value={formData.externalJobId}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="response" className="form-label">Current Status</label>
                <select
                  className="form-select"
                  id="response"
                  name="response"
                  value={formData.response}
                  onChange={handleChange}
                >
                  {responseOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-header">
            <h4 className="mb-0">Additional Information</h4>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label htmlFor="description" className="form-label">Job Description</label>
              <textarea
                className="form-control"
                id="description"
                name="description"
                rows="6"
                value={formData.description}
                onChange={handleChange}
              ></textarea>
            </div>
            <div className="mb-3">
              <label htmlFor="notes" className="form-label">Personal Notes</label>
              <textarea
                className="form-control"
                id="notes"
                name="notes"
                rows="4"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Add any personal notes about your application, interviews, or follow-ups"
              ></textarea>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-between mb-4">
          <Link to={`/view-job/${id}`} className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  );
};

export default EditJobPage;