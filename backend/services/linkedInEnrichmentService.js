const axios = require('axios');
const cheerio = require('cheerio');
const linkedInUtils = require('../utils/linkedInUtils');
const config = require('../config');

// Initialize enrichment queue and tracking
const enrichmentQueue = [];
const processedJobs = {};

// Use LinkedIn rate limit config
const RATE_LIMIT = config.linkedin.rateLimit;

// Set batch size for processing enrichment queue - reduced to avoid timeouts
const ENRICHMENT_BATCH_SIZE = 1; // Process just one job at a time to prevent timeouts

// Log the rate limit configuration being used
console.log('LinkedIn rate limit configuration:', {
  requestsPerMinute: RATE_LIMIT.requestsPerMinute,
  maxConsecutiveFailures: RATE_LIMIT.maxConsecutiveFailures,
  standardDelay: RATE_LIMIT.standardDelay + 'ms',
  backoffDelay: RATE_LIMIT.backoffDelay + 'ms',
  batchSize: ENRICHMENT_BATCH_SIZE
});

/**
 * Add job to enrichment queue
 * @param {string} url LinkedIn job URL
 * @param {Object} jobData Basic job data object
 * @returns {Promise<void>}
 */
exports.queueJobForEnrichment = (url, jobData) => {
  if (!url || !jobData || !jobData.externalJobId) return;

  // Add to the queue if we haven't processed this job yet
  if (!processedJobs[jobData.externalJobId]) {
    enrichmentQueue.push({
      url: url,
      jobData: jobData
    });
    processedJobs[jobData.externalJobId] = true;

    // Automatically start background processing whenever a new job is added
    startBackgroundProcessing();
  }
};

// Track if background processing is already running
let isProcessingInBackground = false;

/**
 * Start background processing of the enrichment queue
 * @returns {void}
 */
function startBackgroundProcessing() {
  // If already processing, don't start another process
  if (isProcessingInBackground) return;

  isProcessingInBackground = true;
  console.log(`Starting background enrichment processing for ${enrichmentQueue.length} jobs`);

  // Use setImmediate to move processing to the background
  setImmediate(async () => {
    try {
      await processEnrichmentQueueInBackground();
    } catch (error) {
      console.error('Background enrichment processing error:', error);
    } finally {
      isProcessingInBackground = false;

      // If there are still jobs in the queue, schedule another processing round
      if (enrichmentQueue.length > 0) {
        setTimeout(startBackgroundProcessing, 1000);
      }
    }
  });
}

/**
 * Process the enrichment queue in the background
 * @returns {Promise<void>}
 */
async function processEnrichmentQueueInBackground() {
  if (enrichmentQueue.length === 0) return;

  const queueSize = enrichmentQueue.length;
  console.log(`Background process: Processing LinkedIn enrichment queue (batch of max ${ENRICHMENT_BATCH_SIZE} from ${queueSize} total jobs)...`);

  let consecutiveFailures = 0;
  const Job = require('../models/Job');

  // Process jobs until we hit rate limits or the queue is empty
  while (enrichmentQueue.length > 0 && consecutiveFailures < RATE_LIMIT.maxConsecutiveFailures) {
    // Take one job from the queue
    const item = enrichmentQueue.shift();

    try {
      const jobId = linkedInUtils.extractJobIdFromUrl(item.url);

      // Apply appropriate delay before making a network request
      if (consecutiveFailures > 0) {
        // Exponential backoff
        const delay = RATE_LIMIT.backoffDelay * Math.pow(2, consecutiveFailures - 1);
        console.log(`Adding backoff delay of ${delay}ms after ${consecutiveFailures} consecutive failures`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Standard delay between requests to respect LinkedIn's rate limits
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.standardDelay));
      }

      console.log(`Fetching data for job ID: ${jobId} (URL: ${item.url})`);
      const enrichedData = await enrichJobDataFromLinkedIn(item.url);

      if (enrichedData) {
        // Success! Reset consecutive failures
        consecutiveFailures = 0;

        // If we have a MongoDB job ID, update the job directly in the database
        if (item.jobData._id) {
          await updateJobWithEnrichment(item.jobData._id, enrichedData);
          console.log(`Updated job ${item.jobData._id} with enriched data directly in database`);
        }
      }
    } catch (error) {
      console.error(`Error during enrichment for job ${item.jobData.externalJobId}:`, error.message);

      // Track consecutive failures to implement backoff
      if (error.response && (error.response.status === 429 || error.response.status === 403)) {
        consecutiveFailures++;
        console.log(`LinkedIn API rate limit hit (${consecutiveFailures}/${RATE_LIMIT.maxConsecutiveFailures} failures)`);

        // Put the item back in the queue for future processing
        if (consecutiveFailures < RATE_LIMIT.maxConsecutiveFailures) {
          enrichmentQueue.unshift(item);
        }

        // If we've hit too many consecutive failures, break out of the loop
        if (consecutiveFailures >= RATE_LIMIT.maxConsecutiveFailures) {
          console.log(`Stopping LinkedIn enrichment after ${RATE_LIMIT.maxConsecutiveFailures} consecutive rate limit errors`);
          break;
        }
      } else {
        // For other errors, log but continue
        console.log(`Non-rate-limit error: ${error.message}`);
      }
    }
  }

  console.log(`Background enrichment batch complete. ${enrichmentQueue.length} jobs remaining in queue for future processing.`);
}

/**
 * Update a job directly in the database with enriched data
 * @param {string} jobId MongoDB job ID
 * @param {Object} enrichedData Enriched data from LinkedIn
 * @returns {Promise<void>}
 */
async function updateJobWithEnrichment(jobId, enrichedData) {
  try {
    // Find the job in the database
    const Job = require('../models/Job');
    const job = await Job.findById(jobId);

    if (!job) {
      console.log(`Job ${jobId} not found in database`);
      return;
    }

    console.log(`Found job ${jobId} in database, applying LinkedIn enrichment...`);

    // CHANGED: Preserve original job title from email, do not update from enrichment
    console.log(`Preserving original job title: "${job.jobTitle}"`);

    // Update job with selected enriched data only (employment type, description, salary)
    let updatesApplied = false;

    if (enrichedData.description) {
      job.description = enrichedData.description;
      console.log('Updated job description from LinkedIn data');
      updatesApplied = true;
    }

    if (enrichedData.employmentType) {
      job.employmentType = enrichedData.employmentType;
      console.log(`Updated employment type to: ${enrichedData.employmentType}`);
      updatesApplied = true;
    }

    // Update salary information if available
    if (enrichedData.salary) {
      const salaryInfo = linkedInUtils.parseSalaryString(enrichedData.salary);
      if (salaryInfo) {
        job.wagesMin = salaryInfo.min;
        job.wagesMax = salaryInfo.max;
        job.wageType = salaryInfo.type;
        console.log(`Updated salary: ${salaryInfo.min}-${salaryInfo.max} ${salaryInfo.type}`);
        updatesApplied = true;
      }
    }

    // Add recruiter information if available
    if (enrichedData.recruiterName) {
      const recruiterNote = `\nRecruiter: ${enrichedData.recruiterName}`;
      const noteAddition = recruiterNote + (enrichedData.recruiterRole ? `, ${enrichedData.recruiterRole}` : '');

      // Check if notes already contain recruiter info
      if (job.notes && job.notes.includes('Recruiter:')) {
        // Don't duplicate recruiter info
        if (!job.notes.includes(enrichedData.recruiterName)) {
          job.notes += noteAddition;
          updatesApplied = true;
        }
      } else {
        // Add recruiter info to existing notes
        job.notes = (job.notes || '') + noteAddition;
        updatesApplied = true;
      }
    }

    // Add a note about enrichment if not already present and if any updates were applied
    if (updatesApplied && (!job.notes || !job.notes.includes('Enriched with LinkedIn data'))) {
      job.notes = (job.notes || '') + '\nEnriched with LinkedIn data';
    }

    // Check if any updates were actually applied
    if (!updatesApplied) {
      console.log(`No LinkedIn data updates were needed for job ${jobId}`);
      return;
    }

    // Mark job as modified to ensure mongoose recognizes changes
    job.markModified('description');
    job.markModified('employmentType');
    job.markModified('wagesMin');
    job.markModified('wagesMax');
    job.markModified('wageType');
    job.markModified('notes');

    // Save the updated job using a promise
    console.log(`Saving LinkedIn enrichment updates to job ${jobId} in database...`);
    try {
      const savedJob = await job.save();
      console.log(`SUCCESS: Job ${jobId} successfully updated with LinkedIn enrichment data. Database save confirmed.`);
      // Log some of the data that was saved for verification
      console.log(`Saved data verification: employmentType=${savedJob.employmentType}, wagesMin=${savedJob.wagesMin}, wagesMax=${savedJob.wagesMax}, wageType=${savedJob.wageType}`);
      return savedJob;
    } catch (saveError) {
      console.error(`Database SAVE ERROR for job ${jobId}:`, saveError);
      throw saveError; // Re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error(`Error updating job ${jobId} with enriched data:`, error);
    // Try one more time with a fresh database connection
    try {
      console.log(`Attempting one retry with fresh database connection for job ${jobId}...`);
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        console.log('MongoDB connection is not ready. Ensuring connection is established...');
        // Make sure we have a database connection
        const dbConnection = require('../utils/dbConnection');
        await dbConnection.ensureConnection();
      }

      const Job = require('../models/Job');
      const job = await Job.findById(jobId);
      if (!job) {
        console.log(`Retry failed: Job ${jobId} not found in database`);
        return;
      }

      // Simplified update with just the essential fields for retry
      if (enrichedData.description) job.description = enrichedData.description;
      if (enrichedData.employmentType) job.employmentType = enrichedData.employmentType;

      if (enrichedData.salary) {
        const salaryInfo = linkedInUtils.parseSalaryString(enrichedData.salary);
        if (salaryInfo) {
          job.wagesMin = salaryInfo.min;
          job.wagesMax = salaryInfo.max;
          job.wageType = salaryInfo.type;
        }
      }

      console.log(`Retry: Saving LinkedIn enrichment for job ${jobId}...`);
      await job.save();
      console.log(`RETRY SUCCESS: Job ${jobId} updated with LinkedIn data on second attempt`);
    } catch (retryError) {
      console.error(`RETRY FAILED: Could not update job ${jobId} with LinkedIn data after retry:`, retryError);
    }
  }
}

/**
 * Process the enrichment queue - this is the original function which now returns immediately
 * @returns {Promise<Object[]>} Always returns an empty array since processing happens in background
 */
exports.processEnrichmentQueue = async () => {
  // Start background processing if not already running
  startBackgroundProcessing();

  // Return immediately - enrichment happens in the background
  return [];
};

/**
 * Get status of background enrichment processing
 * @returns {Object} Status information
 */
exports.getEnrichmentStatus = () => {
  return {
    isProcessing: isProcessingInBackground,
    queueSize: enrichmentQueue.length
  };
};

// Use the parseSalaryString function from utilities
exports.parseSalaryString = linkedInUtils.parseSalaryString;

/**
 * Enrich job data with details from LinkedIn API
 * This uses the public jobs API that LinkedIn provides for job listings
 * @param {string} url LinkedIn job URL
 * @returns {Promise<Object|null>} Enriched job data
 */
async function enrichJobDataFromLinkedIn(url) {
  if (!url) return null;

  try {
    const jobId = linkedInUtils.extractJobIdFromUrl(url);
    if (!jobId) return null;

    // LinkedIn's public jobs API endpoint
    const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

    // Add a timestamp parameter to prevent caching
    const cacheBuster = `?_cb=${Date.now()}`;
    const urlWithCacheBuster = apiUrl + cacheBuster;

    // Browser-like request headers to comply with LinkedIn's terms
    const requestSettings = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.linkedin.com/jobs/',
        'Cache-Control': 'no-cache'
      },
      timeout: RATE_LIMIT.requestTimeout,
      maxRedirects: RATE_LIMIT.maxRedirects
    };

    console.log(`Fetching job data from LinkedIn public API: ${urlWithCacheBuster}`);
    const response = await axios.get(urlWithCacheBuster, requestSettings);

    if (response.status === 200 && response.data) {
      // Parse the HTML response using cheerio
      const $ = cheerio.load(response.data);

      // Extract job details using cheerio selectors
      let jobTitle = $('.top-card-layout__title').text().trim() ||
                     $('.topcard__title').text().trim();

      // Clean up job title - LinkedIn typically shows "Job Title Company · Location"
      if (jobTitle) {
        console.log('Original job title from LinkedIn:', jobTitle);

        // Fix the specific pattern we're seeing:
        // "Job Title       Company · Location" format with multiple spaces
        if (jobTitle.includes('       ')) {
          jobTitle = jobTitle.split('       ')[0].trim();
        }

        // Remove company name and location patterns
        jobTitle = jobTitle
          .replace(/\s*·\s*.+$/i, '')                 // Remove "· Location" part
          .replace(/\s*\(\s*Remote\s*\)\s*$/i, '')    // Remove "(Remote)" suffix
          .replace(/\s*-\s*Remote\s*$/i, '')          // Remove "- Remote" suffix
          .replace(/\s+at .+$/i, '')                  // Remove "at Company" suffix
          .replace(/\s+in .+$/i, '')                  // Remove "in Location" suffix
          .replace(/\s*\([^)]*\)$/i, '')              // Remove any trailing parentheses and their contents
          .replace(/\s{2,}/g, ' ')                    // Replace multiple spaces with a single space
          .trim();

        console.log('Cleaned job title:', jobTitle);
      }

      const company = $('.topcard__org-name-link').text().trim() ||
                      $('.top-card-layout__entity-info a').text().trim();

      const location = $('.topcard__flavor--bullet').text().trim() ||
                       $('.top-card-layout__second-subline .topcard__flavor--bullet').text().trim();

      // Find employment type
      let employmentType = '';
      $('.description__job-criteria-item').each((i, el) => {
        const header = $(el).find('.description__job-criteria-subheader').text().trim();
        if (header.toLowerCase() === 'employment type') {
          employmentType = $(el).find('.description__job-criteria-text').text().trim();
        }
      });

      // Extract job description
      const description = $('.description__text--rich').text().trim() ||
                         $('.show-more-less-html__markup').text().trim();

      // Find salary information
      let salary = '';
      $('.description__job-criteria-item').each((i, el) => {
        const header = $(el).find('.description__job-criteria-subheader').text().trim().toLowerCase();
        if (header.includes('salary') || header.includes('compensation')) {
          salary = $(el).find('.description__job-criteria-text').text().trim();
        }
      });

      // Try the compensation section as a fallback
      if (!salary) {
        const salarySection = $('.compensation__salary-range');
        if (salarySection.length > 0) {
          salary = $('.salary.compensation__salary').text().trim();
        }
      }

      // Method 3: Try to find any element that looks like salary information in the job details
      if (!salary) {
        $('.job-details-jobs-unified-top-card__job-insight').each((i, el) => {
          const text = $(el).text().trim();
          if (text.includes('$') || text.toLowerCase().includes('salary') || text.toLowerCase().includes('compensation')) {
            salary = text;
          }
        });
      }

      // Method 4: Fallback to searching the description text for salary patterns
      if (!salary && description) {
        // Improved regex to capture complete salary patterns including ranges with K notation
        const salaryRegex = /\$[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:\s*-\s*\$?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)?(?:K)?(?:\s*(?:per|\/)\s*(?:hour|year|month|week|yr|hr|mo|wk))?/gi;

        // More specific pattern to prioritize capturing K notation ranges like "$120-130K"
        const kNotationRangeRegex = /\$\d+\s*-\s*\$?\d+K/i;
        const kNotationMatch = description.match(kNotationRangeRegex);

        if (kNotationMatch && kNotationMatch.length > 0) {
          salary = kNotationMatch[0];
          console.log(`Method 4a: Found K notation salary range: "${salary}"`);
        } else {
          const matches = description.match(salaryRegex);
          if (matches && matches.length > 0) {
            // Sort matches by length to prioritize longer, more complete matches
            const sortedMatches = [...matches].sort((a, b) => b.length - a.length);
            salary = sortedMatches[0];
            console.log(`Method 4b: Found salary in description using regex: "${salary}"`);
          }
        }
      }

      // Method 5: Legacy approach - check any list items with dollar signs as last resort
      if (!salary) {
        $('li:contains("$")').each((i, el) => {
          const text = $(el).text().trim();
          if (text.includes('$')) {
            salary = text;
            console.log(`Method 5: Found salary in list item: "${salary}"`);
            return false; // Break after finding the first match
          }
        });
      }

      console.log(`Final salary extraction result: "${salary}"`);

      // Look for recruiter information
      let recruiterName = '';
      let recruiterRole = '';

      $('.message-the-recruiter h3.base-main-card__title').each((i, el) => {
        recruiterName = $(el).text().trim();
      });

      $('.message-the-recruiter h4.base-main-card__subtitle').each((i, el) => {
        recruiterRole = $(el).text().trim();
      });

      // Create result object
      const result = {
        jobTitle: jobTitle || null,
        company: company || null,
        location: location || null,
        description: description || null,
        employmentType: employmentType || null,
        salary: salary || null
      };

      console.log(`Successfully extracted job data for ID: ${jobId}`);
      return result;
    }

    console.log(`LinkedIn API returned invalid or empty data`);
    return null;
  } catch (error) {
    console.error(`LinkedIn API error for ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Apply enriched data to a job object
 * @param {Object} job Job object to be enriched
 * @param {Object} enrichedData Data from LinkedIn API
 * @returns {Object} Updated job object
 */
exports.applyEnrichmentToJob = (job, enrichedData) => {
  if (!job || !enrichedData) return job;

  console.log(`Applying enrichment to job: ${job._id || 'new job'}`);

  const updatedJob = { ...job };

  // CHANGED: Preserve original job title from email, do not update
  console.log(`Preserving original job title: "${job.jobTitle}"`);

  // Only update selected fields with enriched data when available
  let updatesApplied = false;

  // Update description
  if (enrichedData.description) {
    updatedJob.description = enrichedData.description;
    console.log(`Updated description from LinkedIn data`);
    updatesApplied = true;
  }

  // Update employment type
  if (enrichedData.employmentType) {
    updatedJob.employmentType = enrichedData.employmentType;
    console.log(`Updated employment type to: ${enrichedData.employmentType}`);
    updatesApplied = true;
  }

  // Update salary information when available
  if (enrichedData.salary) {
    const salaryInfo = linkedInUtils.parseSalaryString(enrichedData.salary);
    if (salaryInfo) {
      console.log(`Updating salary data to: ${salaryInfo.min}-${salaryInfo.max} ${salaryInfo.type}`);
      updatedJob.wagesMin = salaryInfo.min;
      updatedJob.wagesMax = salaryInfo.max;
      updatedJob.wageType = salaryInfo.type;
      updatesApplied = true;
    }
  }

  // Add recruiter information if available
  if (enrichedData.recruiterName) {
    const recruiterNote = `\nRecruiter: ${enrichedData.recruiterName}`;
    const noteAddition = recruiterNote + (enrichedData.recruiterRole ? `, ${enrichedData.recruiterRole}` : '');

    // Check if notes already contain recruiter info
    if (updatedJob.notes && updatedJob.notes.includes('Recruiter:')) {
      // Don't duplicate recruiter info
      if (!updatedJob.notes.includes(enrichedData.recruiterName)) {
        updatedJob.notes += noteAddition;
        updatesApplied = true;
      }
    } else {
      // Add recruiter info to existing notes
      updatedJob.notes = (updatedJob.notes || '') + noteAddition;
      updatesApplied = true;
    }
  }

  // Add a note about enrichment if updates were applied and the note isn't already present
  if (updatesApplied && (!updatedJob.notes || !updatedJob.notes.includes('Enriched with LinkedIn data'))) {
    updatedJob.notes = (updatedJob.notes || '') + '\nEnriched with LinkedIn data';
  }

  return updatedJob;
}

/**
 * Get the number of pending enrichment jobs in the queue
 * @returns {number} The number of pending enrichments
 */
exports.getPendingEnrichmentCount = () => {
  return enrichmentQueue.length;
};
