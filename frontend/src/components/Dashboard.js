import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import api from '../utils/api';


// Register ChartJS components
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const Dashboard = ({ jobs, refreshData }) => {
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    responseRate: 0,
    avgResponseTime: 0,
    byStatus: {},
    bySource: {},
    byLocationType: {},
    byEmploymentType: {},
    byMonth: {},
    recentActivity: []
  });
  const [applicationStats, setApplicationStats] = useState({
    averagePerDay: 0,
    averagePerWeek: 0,
    averagePerMonth: 0,
    totalApplications: 0,
    earliestApplication: null,
    daysSinceFirstApplication: 0
  });
  const [emailCredentials, setEmailCredentials] = useState([]);
  const [autoImportLoading, setAutoImportLoading] = useState(false);
  const [autoImportResult, setAutoImportResult] = useState(null);

  useEffect(() => {
    // Make sure jobs is an array before calculating stats
    if (Array.isArray(jobs) && jobs.length > 0) {
      calculateStats(jobs);
    }

    // Fetch stored email credentials on component mount
    fetchEmailCredentials();

    // Fetch application statistics
    fetchApplicationStats();
  }, [jobs]);

  const fetchEmailCredentials = async () => {
    try {
      // Fixed: Add leading slash and remove unnecessary /api prefix
      const response = await api.get('/emails/credentials');
      if (response.data && response.data.credentials) {
        setEmailCredentials(response.data.credentials);
      }
    } catch (error) {
      console.error('Error fetching email credentials:', error);
    }
  };

  const fetchApplicationStats = async () => {
    try {
      // Fixed: Remove unnecessary /api prefix
      const response = await api.get('/jobs/stats');
      if (response.data) {
        setApplicationStats(response.data);
      }
    } catch (error) {
      console.error('Error fetching application statistics:', error);
    }
  };

  const handleAutoImport = async (credentialId = null) => {
    try {
      setAutoImportLoading(true);
      setAutoImportResult(null);

      const payload = credentialId ? { credentialId } : {};
      // Fixed: Remove unnecessary /api prefix
      const response = await api.post('/emails/auto-import', payload);

      setAutoImportResult({
        success: true,
        message: response.data.message,
        importedCount: response.data.importedCount
      });

      // Refresh the job list using the new refreshData function
      if (refreshData) {
        refreshData();
      }
    } catch (error) {
      console.error('Error during auto-import:', error);
      setAutoImportResult({
        success: false,
        message: error.response?.data?.message || 'Error auto-importing jobs'
      });
    } finally {
      setAutoImportLoading(false);
    }
  };

  const calculateStats = (jobsArray) => {
    // Ensure we're working with an array
    if (!Array.isArray(jobsArray)) {
      console.error("Expected jobs to be an array but received:", jobsArray);
      return;
    }

    // Total jobs
    const totalJobs = jobsArray.length;

    // Active jobs (not rejected)
    const activeJobs = jobsArray.filter(job => job && job.response !== 'Rejected').length;

    // Response rate
    const respondedJobs = jobsArray.filter(job => job && job.responded).length;
    const responseRate = totalJobs > 0 ? (respondedJobs / totalJobs) * 100 : 0;

    // Jobs by status
    const byStatus = jobsArray.reduce((acc, job) => {
      if (!job) return acc;
      const status = job.response || 'No Response';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Jobs by source
    const bySource = jobsArray.reduce((acc, job) => {
      if (!job) return acc;
      const source = job.source || 'Other';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    // Jobs by location type
    const byLocationType = jobsArray.reduce((acc, job) => {
      if (!job) return acc;
      const locationType = job.locationType || 'Not Specified';
      acc[locationType] = (acc[locationType] || 0) + 1;
      return acc;
    }, {});

    // Jobs by employment type
    const byEmploymentType = jobsArray.reduce((acc, job) => {
      if (!job) return acc;
      const employmentType = job.employmentType || 'Not Specified';
      acc[employmentType] = (acc[employmentType] || 0) + 1;
      return acc;
    }, {});

    // Jobs by month
    const byMonth = jobsArray.reduce((acc, job) => {
      if (!job || !job.applied) return acc;
      const date = new Date(job.applied);
      if (isNaN(date.getTime())) return acc; // Skip invalid dates
      const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      acc[monthYear] = (acc[monthYear] || 0) + 1;
      return acc;
    }, {});

    // Average response time (in days) for jobs that received a response
    let avgResponseTime = 0;
    const jobsWithResponse = jobsArray.filter(job => job && job.responded && job.applied);

    if (jobsWithResponse.length > 0) {
      const totalResponseTime = jobsWithResponse.reduce((total, job) => {
        const appliedDate = new Date(job.applied);
        const respondedDate = new Date(job.responded);
        if (isNaN(appliedDate.getTime()) || isNaN(respondedDate.getTime())) return total;
        const diffTime = Math.abs(respondedDate - appliedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return total + diffDays;
      }, 0);

      avgResponseTime = totalResponseTime / jobsWithResponse.length;
    }

    // Most recent activity
    // Make a safe copy and ensure all items have valid dates before sorting
    const validJobs = jobsArray.filter(job => job && job.applied && !isNaN(new Date(job.applied).getTime()));
    const sortedJobs = [...validJobs].sort((a, b) => new Date(b.applied) - new Date(a.applied));
    const recentActivity = sortedJobs.slice(0, 5);

    setStats({
      totalJobs,
      activeJobs,
      responseRate,
      avgResponseTime,
      byStatus,
      bySource,
      byLocationType,
      byEmploymentType,
      byMonth,
      recentActivity
    });
  };

  const statusChartData = {
    labels: Object.keys(stats.byStatus),
    datasets: [
      {
        data: Object.values(stats.byStatus),
        backgroundColor: [
          '#4CAF50', // Green - Offer/Hired
          '#FFC107', // Yellow - Interview
          '#2196F3', // Blue - Phone Screen
          '#F44336', // Red - Rejected
          '#9E9E9E', // Gray - No Response
          '#673AB7', // Purple - Other
        ],
        borderWidth: 1,
      },
    ],
  };

  const sourceChartData = {
    labels: Object.keys(stats.bySource),
    datasets: [
      {
        label: 'Applications by Source',
        data: Object.values(stats.bySource),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const locationTypeChartData = {
    labels: Object.keys(stats.byLocationType),
    datasets: [
      {
        data: Object.values(stats.byLocationType),
        backgroundColor: [
          '#4CAF50', // Green - Remote
          '#FFC107', // Yellow - Hybrid
          '#2196F3', // Blue - On-site
          '#9E9E9E', // Gray - Not Specified
          '#FF5722', // Deep Orange - Other
        ],
        borderWidth: 1,
      },
    ],
  };

  const employmentTypeChartData = {
    labels: Object.keys(stats.byEmploymentType),
    datasets: [
      {
        data: Object.values(stats.byEmploymentType),
        backgroundColor: [
          '#8BC34A', // Light Green - Full-time
          '#FF9800', // Orange - Part-time
          '#03A9F4', // Light Blue - Contract
          '#9C27B0', // Purple - Internship
          '#E91E63', // Pink - Freelance
          '#9E9E9E', // Gray - Not Specified
          '#795548', // Brown - Other
        ],
        borderWidth: 1,
      },
    ],
  };

  const monthlyChartData = {
    labels: Object.keys(stats.byMonth).slice(-6), // Last 6 months
    datasets: [
      {
        label: 'Applications per Month',
        data: Object.values(stats.byMonth).slice(-6),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  const renderQuickActions = () => (
    <div className="row mb-4">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">Quick Actions</h5>
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2">
              <Link to="/add-job" className="btn btn-primary">Add New Application</Link>
              {emailCredentials.length > 0 && (
                <button
                  className="btn btn-success"
                  onClick={() => handleAutoImport()}
                  disabled={autoImportLoading}
                >
                  {autoImportLoading ? 'Importing...' : 'Email Import'}
                </button>
              )}
              <Link to="/upload-excel" className="btn btn-danger">Excel Import</Link>
            </div>

            {autoImportResult && (
              <div className={`alert mt-3 ${autoImportResult.success ? 'alert-success' : 'alert-danger'}`}>
                <p className="mb-0">{autoImportResult.message}</p>
                {autoImportResult.importedCount > 0 && (
                  <p className="mb-0 mt-2">
                    <Link to="/applications" className="btn btn-sm btn-outline-primary">
                      View Imported Jobs
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <h2 className="mb-4">Job Search Dashboard</h2>

      {/* Quick stats cards */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Total Applications</h5>
              <h2 className="display-4">{stats.totalJobs}</h2>
              <p className="card-text">
                <Link to="/applications" className="btn btn-sm btn-outline-primary">View All</Link>
              </p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Active Applications</h5>
              <h2 className="display-4">{stats.activeJobs}</h2>
              <p className="card-text text-muted">Awaiting response or in process</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Response Rate</h5>
              <h2 className="display-4">{stats.responseRate.toFixed(1)}%</h2>
              <p className="card-text text-muted">Companies that responded</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Avg. Response Time</h5>
              <h2 className="display-4">{stats.avgResponseTime.toFixed(1)}</h2>
              <p className="card-text text-muted">Days to get a response</p>
            </div>
          </div>
        </div>
      </div>

      {/* Application rate stats cards */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Avg. Applications Per Day</h5>
              <h2 className="display-4">{applicationStats.averagePerDay}</h2>
              <p className="card-text text-muted">Since your first application</p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Avg. Applications Per Week</h5>
              <h2 className="display-4">{applicationStats.averagePerWeek}</h2>
              <p className="card-text text-muted">
                {applicationStats.daysSinceFirstApplication > 0
                  ? `Over ${Math.floor(applicationStats.daysSinceFirstApplication / 7)} weeks`
                  : 'No applications yet'}
              </p>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Avg. Applications Per Month</h5>
              <h2 className="display-4">{applicationStats.averagePerMonth}</h2>
              <p className="card-text text-muted">
                {applicationStats.earliestApplication
                  ? `Since ${new Date(applicationStats.earliestApplication).toLocaleDateString()}`
                  : 'No applications yet'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions row */}
      {renderQuickActions()}

      {/* Charts row */}
      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Applications by Status</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                <Pie data={statusChartData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Applications by Source</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '250px' }}>
                <Bar
                  data={sourceChartData}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          precision: 0
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly activity chart */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Monthly Application Activity</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '250px' }}>
                <Bar
                  data={monthlyChartData}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          precision: 0
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Location and Employment Type charts row */}
      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Applications by Location Type</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                <Pie data={locationTypeChartData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Applications by Employment Type</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                <Pie data={employmentTypeChartData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Recent Applications</h5>
              <Link to="/applications" className="btn btn-sm btn-link">View All</Link>
            </div>
            <div className="card-body">
              {stats.recentActivity.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Job Title</th>
                        <th>Company</th>
                        <th>Date Applied</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentActivity.map((job) => (
                        <tr key={job._id}>
                          <td>{job.jobTitle}</td>
                          <td>{job.company}</td>
                          <td>{new Date(job.applied).toLocaleDateString()}</td>
                          <td>{job.response || 'No Response'}</td>
                          <td>
                            <Link to={`/edit-job/${job._id}`} className="btn btn-sm btn-outline-primary me-2">View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-3">No applications yet. <Link to="/add-job">Add your first job application</Link></p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;