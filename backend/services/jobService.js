const Job = require('../models/Job');
const jobUtils = require('../utils/jobUtils');
const emailUtils = require('../utils/emailUtils');

/**
 * Get all jobs
 * @returns {Promise<Array>} List of jobs
 */
exports.getAllJobs = async () => {
  return await Job.find().sort({ applicationDate: -1 });
};

/**
 * Get job by ID
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Job data
 */
exports.getJobById = async (id) => {
  return await Job.findById(id);
};

/**
 * Create a new job
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} Created job
 */
exports.createJob = async (jobData) => {
  const newJob = new Job(jobData);
  return await newJob.save();
};

/**
 * Update existing job
 * @param {string} id - Job ID
 * @param {Object} jobData - Updated job data
 * @returns {Promise<Object>} Updated job
 */
exports.updateJob = async (id, jobData) => {
  return await Job.findByIdAndUpdate(id, jobData, { new: true, runValidators: true });
};

/**
 * Delete a job
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Deleted job
 */
exports.deleteJob = async (id) => {
  return await Job.findByIdAndDelete(id);
};

/**
 * Delete multiple jobs
 * @param {Array} ids - List of job IDs
 * @returns {Promise<Object>} Result with deletedCount
 */
exports.bulkDeleteJobs = async (ids) => {
  return await Job.deleteMany({ _id: { $in: ids } });
};

/**
 * Re-enrich job data from LinkedIn
 * @param {Array} ids - List of job IDs to re-enrich
 * @returns {Promise<Object>} Result with enriched job count and data
 */
exports.reEnrichJobs = async (ids) => {
  const linkedInService = require('./linkedInEnrichmentService');

  // Get jobs by IDs
  const jobs = await Job.find({ _id: { $in: ids } });

  if (!jobs || jobs.length === 0) {
    return { enrichedCount: 0, enrichedJobs: [] };
  }

  // Filter jobs that have LinkedIn URLs
  const jobsWithLinkedIn = jobs.filter(job =>
    job.website &&
    (job.website.includes('linkedin.com/jobs') || job.website.includes('/jobs/view/'))
  );

  if (jobsWithLinkedIn.length === 0) {
    return { enrichedCount: 0, enrichedJobs: [] };
  }

  // Queue each job for enrichment
  jobsWithLinkedIn.forEach(job => {
    linkedInService.queueJobForEnrichment(job.website, {
      externalJobId: job.externalJobId || linkedInService.extractJobIdFromUrl(job.website)
    });
  });

  // Process the enrichment queue
  const enrichedResults = await linkedInService.processEnrichmentQueue();

  // Update jobs with enriched data
  const updatedJobs = [];

  for (const enrichedResult of enrichedResults) {
    const matchingJobs = jobsWithLinkedIn.filter(job =>
      job.externalJobId === enrichedResult.externalJobId ||
      (job.website && linkedInService.extractJobIdFromUrl(job.website) === enrichedResult.externalJobId)
    );

    for (const job of matchingJobs) {
      try {
        // Apply enriched data to job
        const updatedJobData = linkedInService.applyEnrichmentToJob(job, enrichedResult.enrichedData);

        // Create a clean update object with only the fields we want to update
        const updateFields = {};

        // Only include fields that have changed in the update
        if (enrichedResult.enrichedData.description) {
          updateFields.description = updatedJobData.description;
        }

        if (enrichedResult.enrichedData.employmentType) {
          updateFields.employmentType = updatedJobData.employmentType;
        }

        if (enrichedResult.enrichedData.salary) {
          const salaryInfo = linkedInService.parseSalaryString(enrichedResult.enrichedData.salary);
          if (salaryInfo) {
            updateFields.wagesMin = salaryInfo.min;
            updateFields.wagesMax = salaryInfo.max;
            updateFields.wageType = salaryInfo.type;
            console.log(`Setting salary in database: Min=${salaryInfo.min}, Max=${salaryInfo.max}, Type=${salaryInfo.type}`);
          }
        }

        if (enrichedResult.enrichedData.recruiterName) {
          // Handle notes update separately to avoid overwriting
          const recruiterNote = `\nRecruiter: ${enrichedResult.enrichedData.recruiterName}`;
          const noteAddition = recruiterNote + (enrichedResult.enrichedData.recruiterRole ? `, ${enrichedResult.enrichedData.recruiterRole}` : '');

          if (job.notes && job.notes.includes('Recruiter:')) {
            if (!job.notes.includes(enrichedResult.enrichedData.recruiterName)) {
              updateFields.notes = job.notes + noteAddition;
            }
          } else {
            updateFields.notes = (job.notes || '') + noteAddition;
          }
        }

        // Only perform update if we have fields to update
        if (Object.keys(updateFields).length > 0) {
          console.log(`Updating job ${job._id} with fields:`, updateFields);

          // Save changes to database using explicit field updates
          const dbUpdatedJob = await Job.findByIdAndUpdate(
            job._id,
            { $set: updateFields },
            { new: true, runValidators: true }
          );

          console.log(`Database update result:`, dbUpdatedJob ? 'Success' : 'Failed');

          // Add to updated jobs list if successful
          if (dbUpdatedJob) {
            updatedJobs.push(dbUpdatedJob);
          }
        }
      } catch (error) {
        console.error(`Error updating job ${job._id}:`, error.message);
      }
    }
  }

  return {
    enrichedCount: updatedJobs.length,
    enrichedJobs: updatedJobs
  };
};

/**
 * Get application statistics
 * @returns {Promise<Object>} Application statistics
 */
exports.getApplicationStats = async () => {
  // Fetch all jobs with their application dates
  const jobs = await Job.find({}, 'applied');

  if (!jobs || jobs.length === 0) {
    return {
      averagePerDay: 0,
      averagePerWeek: 0,
      averagePerMonth: 0,
      totalApplications: 0,
      earliestApplication: null,
      daysSinceFirstApplication: 0
    };
  }

  // Get the earliest application date
  const applicationDates = jobs.map(job => new Date(job.applied));
  const earliestDate = new Date(Math.min(...applicationDates));
  const currentDate = new Date();

  // Calculate days since first application
  const daysSinceFirstApplication = Math.max(1, Math.ceil(
    (currentDate - earliestDate) / (1000 * 60 * 60 * 24)
  ));

  // Calculate weeks since first application
  const weeksSinceFirstApplication = Math.max(1, daysSinceFirstApplication / 7);

  // Calculate months since first application
  const monthsSinceFirstApplication = Math.max(1, daysSinceFirstApplication / 30.44); // Average days in a month

  // Calculate averages
  const totalApplications = jobs.length;
  const averagePerDay = totalApplications / daysSinceFirstApplication;
  const averagePerWeek = totalApplications / weeksSinceFirstApplication;
  const averagePerMonth = totalApplications / monthsSinceFirstApplication;

  return {
    averagePerDay: parseFloat(averagePerDay.toFixed(2)),
    averagePerWeek: parseFloat(averagePerWeek.toFixed(2)),
    averagePerMonth: parseFloat(averagePerMonth.toFixed(2)),
    totalApplications,
    earliestApplication: earliestDate,
    daysSinceFirstApplication: Math.round(daysSinceFirstApplication)
  };
};

/**
 * Update job status based on email data
 * @param {string} jobId - ID of the job to update
 * @param {Object} statusUpdate - Status update information
 * @returns {Promise<Object>} Updated job
 */
exports.updateJobStatus = async (jobId, statusUpdate) => {
  if (!jobId || !statusUpdate || !statusUpdate.newStatus) {
    throw new Error('Job ID and status update data are required');
  }

  // Find the job to update
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  // Create a status check entry
  const statusCheck = {
    date: statusUpdate.emailDate || new Date(),
    notes: statusUpdate.notes || `Status updated to ${statusUpdate.newStatus}`
  };

  // Add the status check to the job
  job.statusChecks.push(statusCheck);

  // Update response status if appropriate
  if (jobUtils.shouldUpdateJobStatus(job.response, statusUpdate.newStatus)) {
    job.response = statusUpdate.newStatus;
    job.responded = statusUpdate.emailDate || new Date();
  }

  // Save the updated job
  return job.save();
};

/**
 * Process status email and update corresponding job
 * @param {Object} emailData - Email data with subject and date
 * @returns {Promise<Object>} Result with job and status information
 */
exports.processStatusEmail = async (emailData) => {
  if (!emailData || !emailData.subject) {
    throw new Error('Email data is required');
  }

  // Parse the email
  const statusUpdate = emailUtils.parseLinkedInStatusEmail(emailData);
  if (!statusUpdate) {
    throw new Error('Could not parse email for job status update');
  }

  // Find the job to update
  const job = await jobUtils.findJobByCompanyAndTitle(
    statusUpdate.companyName,
    statusUpdate.jobTitle
  );

  if (!job) {
    throw new Error(`No matching job found for company: ${statusUpdate.companyName}`);
  }

  // Create status check entry
  const statusCheck = {
    date: statusUpdate.emailDate,
    notes: statusUpdate.notes
  };

  // Add the status check
  job.statusChecks.push(statusCheck);

  // Update response status if appropriate
  if (jobUtils.shouldUpdateJobStatus(job.response, statusUpdate.newStatus)) {
    job.response = statusUpdate.newStatus;
    job.responded = statusUpdate.emailDate;
  }

  // Save the job
  await job.save();

  return {
    job,
    statusUpdate
  };
};
