import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Get default values from environment variables with fallbacks
const DEFAULT_LOCATION_TYPE = process.env.REACT_APP_DEFAULT_LOCATION_TYPE || 'Remote';
const DEFAULT_EMPLOYMENT_TYPE = process.env.REACT_APP_DEFAULT_EMPLOYMENT_TYPE || 'Full-time';
const DEFAULT_WAGE_TYPE = process.env.REACT_APP_DEFAULT_WAGE_TYPE || 'Yearly';
const DEFAULT_RESPONSE = process.env.REACT_APP_DEFAULT_RESPONSE || 'No Response';

const JobFormPage = ({ job, onSubmit, isEditing }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    source: '',
    searchType: '',
    applicationThrough: '',
    company: '',
    companyLocation: '',
    locationType: DEFAULT_LOCATION_TYPE,
    employmentType: DEFAULT_EMPLOYMENT_TYPE,
    jobTitle: '',
    wagesMin: '',
    wagesMax: '',
    wageType: DEFAULT_WAGE_TYPE,
    applied: new Date().toISOString().substr(0, 10),
    responded: null, // Changed from false to null to prevent default date
    response: DEFAULT_RESPONSE,
    website: '',
    description: '',
    externalJobId: '',
    notes: ''
  });

  // For tracking submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For tracking status checks
  const [statusCheck, setStatusCheck] = useState({
    date: new Date().toISOString().substr(0, 10),
    notes: ''
  });

  // For handling status checks
  const [statusChecks, setStatusChecks] = useState([]);

  // Memoize data initialization to prevent unnecessary re-renders
  const initializeFormData = useCallback(() => {
    if (job) {
      const jobData = { ...job };
      if (job.applied) {
        jobData.applied = new Date(job.applied).toISOString().substr(0, 10);
      }

      // Handle status checks
      if (job.statusChecks && job.statusChecks.length > 0) {
        setStatusChecks(job.statusChecks.map(check => ({
          ...check,
          date: new Date(check.date).toISOString().substr(0, 10)
        })));
      }

      setFormData(jobData);
    }
  }, [job]);

  useEffect(() => {
    initializeFormData();
  }, [initializeFormData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'responded' && value === '' ? null : value)
    }));
  };

  const handleStatusCheckChange = (e) => {
    const { name, value } = e.target;
    setStatusCheck(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addStatusCheck = (e) => {
    e.preventDefault();
    if (statusCheck.date && statusCheck.notes) {
      setStatusChecks(prev => [...prev, { ...statusCheck }]);
      setStatusCheck({
        date: new Date().toISOString().substr(0, 10),
        notes: ''
      });
    }
  };

  const removeStatusCheck = (index) => {
    setStatusChecks(statusChecks.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent double submission

    setIsSubmitting(true);

    // Add status checks to the form data
    const finalFormData = { ...formData, statusChecks };

    try {
      const success = await onSubmit(finalFormData);
      if (success) {
        // Use navigate without reload
        navigate('/');
      }
    } catch (error) {
      console.error('Error saving job:', error);
      // Handle error state if needed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="job-form">
      <h2>{isEditing ? 'Edit Job Application' : 'Add New Job Application'}</h2>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Job Title*</label>
            <input
              type="text"
              name="jobTitle"
              className="form-control"
              value={formData.jobTitle || ''}
              onChange={handleChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Company*</label>
            <input
              type="text"
              name="company"
              className="form-control"
              value={formData.company || ''}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        {/* Rest of the form remains unchanged */}
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Source</label>
            <input
              type="text"
              name="source"
              className="form-control"
              placeholder="LinkedIn, Indeed, Referral, etc."
              value={formData.source || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Search Type</label>
            <input
              type="text"
              name="searchType"
              className="form-control"
              placeholder="Direct, Recruiter, etc."
              value={formData.searchType || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Application Through</label>
            <input
              type="text"
              name="applicationThrough"
              className="form-control"
              placeholder="Company website, LinkedIn Easy Apply, etc."
              value={formData.applicationThrough || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Company Location</label>
            <input
              type="text"
              name="companyLocation"
              className="form-control"
              placeholder="City, State, Country"
              value={formData.companyLocation || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Location Type</label>
            <select
              name="locationType"
              className="form-select"
              value={formData.locationType || 'Remote'}
              onChange={handleChange}
            >
              <option value="Remote">Remote</option>
              <option value="On-site">On-site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Employment Type</label>
            <select
              name="employmentType"
              className="form-select"
              value={formData.employmentType || 'Full-time'}
              onChange={handleChange}
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
              <option value="Freelance">Freelance</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Minimum Wage</label>
            <input
              type="number"
              name="wagesMin"
              className="form-control"
              value={formData.wagesMin || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Maximum Wage</label>
            <input
              type="number"
              name="wagesMax"
              className="form-control"
              value={formData.wagesMax || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Wage Type</label>
            <select
              name="wageType"
              className="form-select"
              value={formData.wageType || 'Yearly'}
              onChange={handleChange}
            >
              <option value="Hourly">Hourly</option>
              <option value="Yearly">Yearly</option>
              <option value="Monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Project">Project</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Date Applied</label>
            <input
              type="date"
              name="applied"
              className="form-control"
              value={formData.applied || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">External Job ID</label>
            <input
              type="text"
              name="externalJobId"
              className="form-control"
              placeholder="Job ID from external source"
              value={formData.externalJobId || ''}
              onChange={handleChange}
            />
            <div className="form-text">ID from external job source (e.g., LinkedIn)</div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Job Website/URL</label>
            <input
              type="url"
              name="website"
              className="form-control"
              placeholder="https://example.com/job-posting"
              value={formData.website || ''}
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">Date Responded</label>
            <input
              type="date"
              name="responded"
              className="form-control"
              value={formData.responded ? new Date(formData.responded).toISOString().substr(0, 10) : ''}
              onChange={handleChange}
            />
            <div className="form-text">Leave empty if no response received yet</div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Response Status</label>
            <select
              name="response"
              className="form-select"
              value={formData.response || 'No Response'}
              onChange={handleChange}
            >
              <option value="No Response">No Response</option>
              <option value="Rejected">Rejected</option>
              <option value="Phone Screen">Phone Screen</option>
              <option value="Interview">Interview</option>
              <option value="Offer">Offer</option>
              <option value="Hired">Hired</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Job Description</label>
          <textarea
            name="description"
            className="form-control"
            value={formData.description || ''}
            onChange={handleChange}
            rows="3"
          ></textarea>
        </div>

        <div className="mb-3">
          <label className="form-label">Notes</label>
          <textarea
            name="notes"
            className="form-control"
            value={formData.notes || ''}
            onChange={handleChange}
            rows="3"
          ></textarea>
        </div>

        <div className="card mb-4">
          <div className="card-header">
            Status Check History
          </div>
          <div className="card-body">
            <div className="mb-3">
              <div className="row">
                <div className="col-md-4">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    name="date"
                    className="form-control"
                    value={statusCheck.date}
                    onChange={handleStatusCheckChange}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    name="notes"
                    className="form-control"
                    value={statusCheck.notes}
                    onChange={handleStatusCheckChange}
                    placeholder="E.g., Sent follow-up email"
                  />
                </div>
                <div className="col-md-2 d-flex align-items-end">
                  <button
                    type="button"
                    className="btn btn-secondary w-100"
                    onClick={addStatusCheck}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {statusChecks.length > 0 && (
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {statusChecks.map((check, index) => (
                    <tr key={index}>
                      <td>{new Date(check.date).toLocaleDateString()}</td>
                      <td>{check.notes}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeStatusCheck(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? (isEditing ? 'Updating...' : 'Adding...')
            : (isEditing ? 'Update Job' : 'Add Job')}
        </button>
      </form>
    </div>
  );
};

export default JobFormPage;