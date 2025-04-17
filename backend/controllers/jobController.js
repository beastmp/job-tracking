const Job = require('../models/Job');
const jobService = require('../services/jobService');

// Get all jobs
exports.getJobs = async (req, res) => {
  try {
    const jobs = await jobService.getAllJobs();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching jobs', error: error.message });
  }
};

// Re-enrich job data from LinkedIn
exports.reEnrichJobs = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No job IDs provided for enrichment' });
    }

    const result = await jobService.reEnrichJobs(ids);
    res.status(200).json({
      message: result.message || `Successfully queued ${result.queuedCount} jobs for LinkedIn enrichment`,
      queuedCount: result.queuedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Error queuing jobs for enrichment', error: error.message });
  }
};

// Get a single job
exports.getJob = async (req, res) => {
  try {
    const job = await jobService.getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching job', error: error.message });
  }
};

// Create a job
exports.createJob = async (req, res) => {
  try {
    const savedJob = await jobService.createJob(req.body);
    res.status(201).json(savedJob);
  } catch (error) {
    res.status(500).json({ message: 'Error creating job', error: error.message });
  }
};

// Update a job
exports.updateJob = async (req, res) => {
  try {
    const updatedJob = await jobService.updateJob(req.params.id, req.body);
    if (!updatedJob) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(200).json(updatedJob);
  } catch (error) {
    res.status(500).json({ message: 'Error updating job', error: error.message });
  }
};

// Delete a job
exports.deleteJob = async (req, res) => {
  try {
    const result = await jobService.deleteJob(req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting job', error: error.message });
  }
};

// Bulk delete jobs
exports.bulkDeleteJobs = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No job IDs provided for deletion' });
    }

    const result = await jobService.bulkDeleteJobs(ids);
    res.status(200).json({
      message: `Successfully deleted ${result.deletedCount} jobs`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Error bulk deleting jobs', error: error.message });
  }
};

// Get applications data
exports.getApplications = async (req, res) => {
  try {
    const jobs = await jobService.getAllJobs();
    res.status(200).json(jobs);
  } catch (error) {
    console.error('Error in getApplications:', error);
    res.status(500).json({ message: 'Error fetching applications data', error: error.message });
  }
};

// Get application statistics
exports.getApplicationStats = async (req, res) => {
  try {
    const stats = await jobService.getApplicationStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error calculating application statistics:', error);
    res.status(500).json({ message: 'Error calculating application statistics', error: error.message });
  }
};

// Helper to update job status from email
exports.updateJobStatus = async (req, res) => {
  try {
    const { jobId, statusUpdate } = req.body;

    if (!jobId || !statusUpdate || !statusUpdate.newStatus) {
      return res.status(400).json({
        message: jobId ? 'Status update data is required' : 'Job ID is required'
      });
    }

    const updatedJob = await jobService.updateJobStatus(jobId, statusUpdate);

    res.status(200).json({
      message: `Job status updated to ${updatedJob.response}`,
      job: updatedJob
    });
  } catch (error) {
    console.error('Error updating job status:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating job status', error: error.message });
  }
};

// Manually process status update email
exports.processStatusEmail = async (req, res) => {
  try {
    const { emailData } = req.body;

    if (!emailData || !emailData.subject) {
      return res.status(400).json({ message: 'Email data is required' });
    }

    try {
      const result = await jobService.processStatusEmail(emailData);

      res.status(200).json({
        message: `Job status updated for ${result.job.company} - ${result.job.jobTitle}`,
        job: result.job,
        statusUpdate: result.statusUpdate
      });
    } catch (error) {
      if (error.message.includes('No matching job found')) {
        return res.status(404).json({ message: error.message, emailData });
      } else if (error.message.includes('Could not parse email')) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error processing status email:', error);
    res.status(500).json({ message: 'Error processing status email', error: error.message });
  }
};