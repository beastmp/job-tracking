/**
 * Job-related utility functions
 */
const Job = require('../models/Job');

/**
 * Find job by company name and job title
 * @param {string} companyName Company name
 * @param {string} jobTitle Job title (optional)
 * @param {string} externalJobId External job ID (optional)
 * @returns {Promise<Object|null>} Job object or null if not found
 */
exports.findJob = async (companyName, jobTitle, externalJobId) => {
  // Try to find with external job ID if provided
  let job = null;

  if (externalJobId) {
    job = await Job.findOne({ externalJobId });
  }

  // If not found and job title is provided, try with company and job title
  if (!job && jobTitle) {
    job = await Job.findOne({
      company: new RegExp(companyName, 'i'),
      jobTitle: new RegExp(jobTitle, 'i')
    });
  }

  // If still not found, try with just company name
  if (!job) {
    // Get most recent job for this company
    job = await Job.findOne({ company: new RegExp(companyName, 'i') })
      .sort({ applied: -1 });
  }

  return job;
};

/**
 * Check if job status should be updated based on priority
 * @param {string} currentStatus Current job status
 * @param {string} newStatus New job status
 * @returns {boolean} True if status should be updated
 */
exports.shouldUpdateJobStatus = (currentStatus, newStatus) => {
  const priorities = {
    'No Response': 0,
    'Rejected': 1,
    'Phone Screen': 2,
    'Interview': 3,
    'Offer': 4,
    'Hired': 5
  };

  const currentPriority = priorities[currentStatus] || 0;
  const newPriority = priorities[newStatus] || 0;

  // Update if new status has higher priority or current is "No Response"
  return newPriority > currentPriority || currentStatus === 'No Response';
};
