/**
 * Simple in-memory job queue system
 */

// Store active jobs with their status
const jobs = {};
const jobEventHandlers = {};

/**
 * Create a new job
 * @param {string} type - Type of job
 * @param {Object} data - Job data
 * @returns {string} Job ID
 */
exports.createJob = (type, data = {}) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  jobs[jobId] = {
    id: jobId,
    type,
    data,
    status: 'pending',
    progress: 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    updates: []
  };
  
  return jobId;
};

/**
 * Update a job's status and progress
 * @param {string} jobId - Job ID
 * @param {Object} update - Updates to apply
 * @returns {Object} Updated job
 */
exports.updateJob = (jobId, update = {}) => {
  if (!jobs[jobId]) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  const job = jobs[jobId];
  
  // Apply updates
  Object.assign(job, update);
  
  // Add to updates log
  if (update.message) {
    job.updates.push({
      time: new Date(),
      message: update.message,
      progress: update.progress || job.progress
    });
  }
  
  // Trigger event handlers
  if (jobEventHandlers[jobId]) {
    jobEventHandlers[jobId].forEach(handler => {
      try {
        handler(job);
      } catch (error) {
        console.error('Error in job event handler:', error);
      }
    });
  }
  
  return job;
};

/**
 * Start processing a job
 * @param {string} jobId - Job ID
 * @returns {Object} Updated job
 */
exports.startJob = (jobId) => {
  if (!jobs[jobId]) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  return exports.updateJob(jobId, { 
    status: 'processing', 
    startedAt: new Date(),
    message: 'Job started',
    progress: 5
  });
};

/**
 * Complete a job successfully
 * @param {string} jobId - Job ID
 * @param {Object} result - Optional result data
 * @returns {Object} Updated job
 */
exports.completeJob = (jobId, result = null) => {
  if (!jobs[jobId]) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  return exports.updateJob(jobId, { 
    status: 'completed', 
    completedAt: new Date(),
    result,
    progress: 100,
    message: 'Job completed successfully'
  });
};

/**
 * Fail a job
 * @param {string} jobId - Job ID
 * @param {Error} error - Error object or message
 * @returns {Object} Updated job
 */
exports.failJob = (jobId, error) => {
  if (!jobs[jobId]) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  return exports.updateJob(jobId, { 
    status: 'failed', 
    completedAt: new Date(),
    error: error instanceof Error ? error.message : error,
    message: `Job failed: ${error instanceof Error ? error.message : error}`
  });
};

/**
 * Get a job by ID
 * @param {string} jobId - Job ID
 * @returns {Object} Job
 */
exports.getJob = (jobId) => {
  if (!jobs[jobId]) {
    return null;
  }
  
  return jobs[jobId];
};

/**
 * Clean up old completed jobs
 * Keep only the last 100 jobs or jobs less than 1 hour old
 */
exports.cleanupOldJobs = () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const jobIds = Object.keys(jobs);
  
  // Only clean if we have a lot of jobs
  if (jobIds.length > 100) {
    // Sort by creation time, oldest first
    const sortedIds = jobIds
      .filter(id => jobs[id].status === 'completed' || jobs[id].status === 'failed')
      .sort((a, b) => jobs[a].createdAt - jobs[b].createdAt);
    
    // Remove old jobs
    const idsToRemove = sortedIds.slice(0, sortedIds.length - 100);
    idsToRemove.forEach(id => {
      // Only delete if it's older than 1 hour and completed/failed
      if (jobs[id].createdAt < oneHourAgo) {
        delete jobs[id];
        delete jobEventHandlers[id];
      }
    });
  }
};

/**
 * Register event handler for job updates
 * @param {string} jobId - Job ID
 * @param {Function} handler - Handler function to call on job updates
 */
exports.onJobUpdate = (jobId, handler) => {
  if (!jobEventHandlers[jobId]) {
    jobEventHandlers[jobId] = [];
  }
  
  jobEventHandlers[jobId].push(handler);
};

/**
 * Remove event handler for job updates
 * @param {string} jobId - Job ID
 * @param {Function} handler - Handler function to remove
 */
exports.offJobUpdate = (jobId, handler) => {
  if (!jobEventHandlers[jobId]) return;
  
  const index = jobEventHandlers[jobId].indexOf(handler);
  if (index !== -1) {
    jobEventHandlers[jobId].splice(index, 1);
  }
  
  // Clean up empty handlers array
  if (jobEventHandlers[jobId].length === 0) {
    delete jobEventHandlers[jobId];
  }
};

// Run cleanup periodically
setInterval(exports.cleanupOldJobs, 15 * 60 * 1000); // Every 15 minutes