import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { jobsAPI } from '../utils/api';

const ApplicationsPage = ({ jobs, onDeleteJob, onUpdateStatus, onBulkDeleteJobs }) => {
  const [selectedJobs, setSelectedJobs] = useState({});
  const [selectAll, setSelectAll] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortField, setSortField] = useState('applied');
  const [sortDirection, setSortDirection] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [enrichingJobs, setEnrichingJobs] = useState(false);
  const [enrichmentMessage, setEnrichmentMessage] = useState(null);

  // Handle select all checkbox
  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    const newSelectedJobs = {};
    if (newSelectAll) {
      filteredJobs.forEach(job => {
        newSelectedJobs[job._id] = true;
      });
    }
    setSelectedJobs(newSelectedJobs);
  };

  // Handle individual job selection
  const handleSelectJob = (jobId) => {
    setSelectedJobs(prev => {
      const newSelectedJobs = { ...prev };
      newSelectedJobs[jobId] = !prev[jobId];

      // Update selectAll state based on if all jobs are selected
      const allSelected = filteredJobs.every(job => newSelectedJobs[job._id]);
      setSelectAll(allSelected);

      return newSelectedJobs;
    });
  };

  // Count selected jobs
  const selectedCount = Object.values(selectedJobs).filter(Boolean).length;

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedCount === 0) return;

    if (window.confirm(`Are you sure you want to delete ${selectedCount} selected job applications?`)) {
      const jobIdsToDelete = Object.keys(selectedJobs).filter(id => selectedJobs[id]);
      onBulkDeleteJobs(jobIdsToDelete);
      setSelectedJobs({});
      setSelectAll(false);
    }
  };

  // Handle re-enrich from LinkedIn
  const handleReEnrichJobs = async () => {
    if (selectedCount === 0) return;

    try {
      setEnrichingJobs(true);
      setEnrichmentMessage({
        type: 'info',
        text: `Re-enriching ${selectedCount} selected job listings from LinkedIn...`
      });

      const jobIdsToEnrich = Object.keys(selectedJobs).filter(id => selectedJobs[id]);
      const response = await jobsAPI.reEnrichJobs(jobIdsToEnrich);

      setEnrichmentMessage({
        type: 'success',
        text: `Successfully enriched ${response.data.enrichedCount} job listings with data from LinkedIn.`
      });

      // Clear selection after successful operation
      setSelectedJobs({});
      setSelectAll(false);

      // Refresh the jobs list after enrichment
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      setEnrichmentMessage({
        type: 'danger',
        text: `Error enriching job data: ${error.response?.data?.message || error.message}`
      });
    } finally {
      setEnrichingJobs(false);
    }
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending for date, ascending for text
      setSortField(field);
      setSortDirection(field === 'applied' ? 'desc' : 'asc');
    }
  };

  // Filter and sort jobs
  const filteredJobs = jobs.filter(job => {
    // Status filter
    if (filterStatus !== 'All' && job.response !== filterStatus) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        (job.jobTitle && job.jobTitle.toLowerCase().includes(search)) ||
        (job.company && job.company.toLowerCase().includes(search)) ||
        (job.companyLocation && job.companyLocation.toLowerCase().includes(search)) ||
        (job.description && job.description.toLowerCase().includes(search))
      );
    }

    return true;
  }).sort((a, b) => {
    // Sort logic
    let valueA, valueB;

    switch (sortField) {
      case 'jobTitle':
      case 'company':
      case 'companyLocation':
      case 'response':
        valueA = (a[sortField] || '').toLowerCase();
        valueB = (b[sortField] || '').toLowerCase();
        break;
      case 'applied':
        valueA = new Date(a.applied);
        valueB = new Date(b.applied);
        break;
      default:
        valueA = a[sortField];
        valueB = b[sortField];
    }

    if (sortDirection === 'asc') {
      return valueA > valueB ? 1 : -1;
    } else {
      return valueA < valueB ? 1 : -1;
    }
  });

  // Calculate status counts for filter badges
  const statusCounts = jobs.reduce((acc, job) => {
    const status = job.response || 'No Response';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { 'All': jobs.length });

  return (
    <div className="applications-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>My Job Applications</h2>
        <Link to="/add-job" className="btn btn-primary">Add New Application</Link>
      </div>

      {/* Filter and search tools */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row">
            <div className="col-md-6 mb-3 mb-md-0">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search jobs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setSearchTerm('')}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="col-md-6 d-flex justify-content-md-end">
              <div className="btn-group" role="group">
                <button
                  type="button"
                  className={`btn ${filterStatus === 'All' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilterStatus('All')}
                >
                  All <span className="badge bg-secondary">{statusCounts['All']}</span>
                </button>
                <button
                  type="button"
                  className={`btn ${filterStatus === 'No Response' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilterStatus('No Response')}
                >
                  No Response <span className="badge bg-secondary">{statusCounts['No Response'] || 0}</span>
                </button>
                <button
                  type="button"
                  className={`btn ${filterStatus === 'Interview' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilterStatus('Interview')}
                >
                  Interview <span className="badge bg-secondary">{statusCounts['Interview'] || 0}</span>
                </button>
                <button
                  type="button"
                  className={`btn ${filterStatus === 'Offer' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilterStatus('Offer')}
                >
                  Offer <span className="badge bg-secondary">{statusCounts['Offer'] || 0}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="alert alert-info d-flex justify-content-between align-items-center">
          <span><strong>{selectedCount}</strong> applications selected</span>
          <div>
            <button
              className="btn btn-danger me-2"
              onClick={handleBulkDelete}
            >
              Delete Selected
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReEnrichJobs}
              disabled={enrichingJobs}
            >
              {enrichingJobs ? 'Enriching...' : 'Re-enrich from LinkedIn'}
            </button>
          </div>
        </div>
      )}

      {enrichmentMessage && (
        <div className={`alert alert-${enrichmentMessage.type}`}>
          {enrichmentMessage.text}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="alert alert-info">
          {jobs.length === 0 ? (
            <p className="mb-0">No job applications yet. Start by adding a job or importing with Excel.</p>
          ) : (
            <p className="mb-0">No applications match your current filters. <button className="btn btn-link p-0" onClick={() => { setFilterStatus('All'); setSearchTerm(''); }}>Clear filters</button></p>
          )}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead>
              <tr>
                <th>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={selectAll}
                      onChange={handleSelectAll}
                      id="selectAllJobs"
                    />
                    <label className="form-check-label" htmlFor="selectAllJobs">
                      All
                    </label>
                  </div>
                </th>
                <th onClick={() => handleSort('applied')} style={{cursor: 'pointer'}}>
                  Date Applied
                  {sortField === 'applied' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('jobTitle')} style={{cursor: 'pointer'}}>
                  Job Title
                  {sortField === 'jobTitle' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('company')} style={{cursor: 'pointer'}}>
                  Company
                  {sortField === 'company' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('companyLocation')} style={{cursor: 'pointer'}}>
                  Location
                  {sortField === 'companyLocation' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('locationType')} style={{cursor: 'pointer'}}>
                  Location Type
                  {sortField === 'locationType' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('employmentType')} style={{cursor: 'pointer'}}>
                  Employment Type
                  {sortField === 'employmentType' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('wagesMin')} style={{cursor: 'pointer'}}>
                  Wages
                  {sortField === 'wagesMin' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('externalJobId')} style={{cursor: 'pointer'}}>
                  External ID
                  {sortField === 'externalJobId' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => handleSort('response')} style={{cursor: 'pointer'}}>
                  Response
                  {sortField === 'response' && (
                    <span className="ms-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => (
                <tr key={job._id}>
                  <td>
                    <div className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={!!selectedJobs[job._id]}
                        onChange={() => handleSelectJob(job._id)}
                      />
                    </div>
                  </td>
                  <td>{new Date(job.applied).toLocaleDateString()}</td>
                  <td>
                    {job.website ? (
                      <a href={job.website} target="_blank" rel="noopener noreferrer">
                        {job.jobTitle}
                      </a>
                    ) : (
                      job.jobTitle
                    )}
                  </td>
                  <td>{job.company}</td>
                  <td>{job.companyLocation || 'N/A'}</td>
                  <td>{job.locationType || 'N/A'}</td>
                  <td>{job.employmentType || 'N/A'}</td>
                  <td>
                    {job.wagesMin || job.wagesMax ?
                      `$${job.wagesMin ? job.wagesMin : ''}${job.wagesMin && job.wagesMax ? '-' : ''}${job.wagesMax ? job.wagesMax : ''} ${job.wageType || ''}`
                      : 'N/A'}
                  </td>
                  <td>{job.externalJobId || 'N/A'}</td>
                  <td>{job.response || 'No Response'}
                    {job.responded && (
                      <small className="text-muted d-block mt-1">
                        Responded: {new Date(job.responded).toLocaleDateString()}
                      </small>
                    )}
                  </td>
                  <td>
                    <Link to={`/edit-job/${job._id}`} className="btn btn-sm btn-primary me-2">Edit</Link>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => onDeleteJob(job._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-4">
        <p className="text-muted mb-0">Showing {filteredJobs.length} of {jobs.length} applications</p>
        <div>
          <Link to="/" className="btn btn-outline-secondary me-2">Back to Dashboard</Link>
          <Link to="/add-job" className="btn btn-primary">Add New Application</Link>
        </div>
      </div>
    </div>
  );
};

export default ApplicationsPage;