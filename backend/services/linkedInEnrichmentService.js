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
const ENRICHMENT_BATCH_SIZE = 2; // Reduced from 3 to 2 to prevent timeouts

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
  }
};

/**
 * Process the enrichment queue with proper rate limiting and batching
 * @returns {Promise<Object[]>} Array of processed job data with enrichments
 */
exports.processEnrichmentQueue = async () => {
  if (enrichmentQueue.length === 0) return [];

  const queueSize = enrichmentQueue.length;
  console.log(`Processing LinkedIn enrichment queue (batch of max ${ENRICHMENT_BATCH_SIZE} from ${queueSize} total jobs)...`);

  const enrichedJobs = [];
  let consecutiveFailures = 0;

  // Only process a limited batch of jobs to avoid timeouts
  const batchSize = Math.min(ENRICHMENT_BATCH_SIZE, enrichmentQueue.length);
  const currentBatch = enrichmentQueue.splice(0, batchSize);

  // Process the current batch with improved rate limiting
  for (const item of currentBatch) {
    let retryCurrentItem = false;
    let enrichedData = null;

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
      enrichedData = await enrichJobDataFromLinkedIn(item.url);

      if (enrichedData) {
        // Success! Reset consecutive failures
        consecutiveFailures = 0;

        // Save enriched job for return
        enrichedJobs.push({
          externalJobId: item.jobData.externalJobId,
          enrichedData
        });
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

  console.log(`Batch processing complete. ${enrichmentQueue.length} jobs remaining in queue for future processing.`);

  // Note: we're not clearing the entire queue anymore, only removing processed items
  // The remaining items will be processed on subsequent requests

  return enrichedJobs;
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
      const jobTitle = $('.top-card-layout__title').text().trim() ||
                       $('.topcard__title').text().trim();

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

  // Always update job data with enriched data when available
  if (enrichedData.description) {
    updatedJob.description = enrichedData.description;
    console.log(`Updated description`);
  }

  if (enrichedData.employmentType) {
    updatedJob.employmentType = enrichedData.employmentType;
    console.log(`Updated employment type to: ${enrichedData.employmentType}`);
  }

  // Always update salary information when available
  if (enrichedData.salary) {
    const salaryInfo = linkedInUtils.parseSalaryString(enrichedData.salary);
    if (salaryInfo) {
      console.log(`Updating salary data to: ${salaryInfo.min}-${salaryInfo.max} ${salaryInfo.type}`);
      updatedJob.wagesMin = salaryInfo.min;
      updatedJob.wagesMax = salaryInfo.max;
      updatedJob.wageType = salaryInfo.type;
    }
  }

  // Add or update recruiter information
  if (enrichedData.recruiterName) {
    const recruiterNote = `\nRecruiter: ${enrichedData.recruiterName}`;
    const noteAddition = recruiterNote + (enrichedData.recruiterRole ? `, ${enrichedData.recruiterRole}` : '');

    // Check if notes already contain recruiter info
    if (updatedJob.notes && updatedJob.notes.includes('Recruiter:')) {
      // Don't duplicate recruiter info
      if (!updatedJob.notes.includes(enrichedData.recruiterName)) {
        updatedJob.notes += noteAddition;
      }
    } else {
      // Add recruiter info to existing notes
      updatedJob.notes = (updatedJob.notes || '') + noteAddition;
    }

    console.log(`Updated recruiter info: ${enrichedData.recruiterName}`);
  }

  return updatedJob;
};

/**
 * Get the number of pending enrichment jobs in the queue
 * @returns {number} The number of pending enrichments
 */
exports.getPendingEnrichmentCount = () => {
  return enrichmentQueue.length;
};
