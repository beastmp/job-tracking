/**
 * Web Enrichment Service - Extracts job details from websites
 *
 * This service is designed to:
 * 1. Extract job data from websites including job description, salary, location, etc.
 * 2. Handle rate limiting with configurable delays
 * 3. Process enrichment tasks in the background to avoid timeouts
 * 4. Update job records with the enriched data
 */
const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const Redis = require('ioredis');

// Configurable delay between requests to prevent rate limiting
const REQUEST_DELAY_MS = 700;

// In-memory queue for development; can be replaced with Redis for production
let enrichmentQueue = [];
let isProcessing = false;
let enrichmentMap = new Map(); // Maps URLs to job IDs

// Setup Redis client if configured (or use in-memory otherwise)
let redisClient;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
    console.log('Connected to Redis for job enrichment queue');
  }
} catch (error) {
  console.log('Redis not available, using in-memory queue');
}

/**
 * Extract job data from a website URL
 * @param {string} url - URL of the job posting
 * @returns {Promise<Object|null>} Extracted job data or null if extraction failed
 */
exports.extractJobData = async (url) => {
  if (!url) {
    console.log('No URL provided for job data extraction');
    return null;
  }

  console.log(`Extracting job data from URL: ${url}`);

  try {
    // Make request to the job page with appropriate headers to avoid detection
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    if (response.status !== 200 || !response.data) {
      console.log(`Failed to fetch content from ${url}`);
      return null;
    }

    // Parse the HTML
    const $ = cheerio.load(response.data);
    let jobData = {};

    // Extract job title
    jobData.jobTitle = extractJobTitle($);

    // Extract company name
    jobData.company = extractCompany($);

    // Extract location
    jobData.companyLocation = extractLocation($);

    // Extract job type
    jobData.employmentType = extractEmploymentType($);

    // Extract location type (remote, etc.)
    jobData.locationType = extractLocationType($);

    // Extract salary information
    const salary = extractSalary($);
    if (salary) {
      jobData = { ...jobData, ...salary };
    }

    // Extract job description
    jobData.description = extractDescription($);

    // Extract external job ID if any
    jobData.externalJobId = extractExternalJobId($, url);

    // Clean up any empty data values to avoid overwriting good data
    Object.keys(jobData).forEach(key => {
      if (!jobData[key]) delete jobData[key];
    });

    console.log('Extracted job data:', jobData);

    return jobData;
  } catch (error) {
    console.error(`Error extracting job data from ${url}:`, error.message);
    return null;
  }
};

/**
 * Extract job title from the page
 */
function extractJobTitle($) {
  // Try different common selectors for job titles
  const selectors = [
    'h1', // Most common
    '.job-title', '.jobTitle',
    '.position-title', '.positionTitle',
    '.job-header h1', '.job-header h2',
    'h1.title', 'h2.title',
    '[data-testid="jobTitle"]',
    '[data-automation="job-title"]',
    'title' // Last resort - page title often contains job title
  ];

  let jobTitle = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      jobTitle = element.text().trim();

      // If this is from the page title, clean it up
      if (selector === 'title') {
        // Page titles often follow patterns like "Job Title - Company" or "Job Title | Company"
        jobTitle = jobTitle.split(/[-|]/)[0].trim();
      }

      if (jobTitle) break;
    }
  }

  // Clean up
  return jobTitle
    .replace(/[\n\t\r]+/g, ' ')     // Replace line breaks with spaces
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
    .trim();
}

/**
 * Extract company name from the page
 */
function extractCompany($) {
  // Try different common selectors for company names
  const selectors = [
    '.company', '.company-name',
    '.employer', '.organization',
    '[data-testid="company"]',
    '[data-automation="company-name"]',
    'title', // Often contains company name
  ];

  let company = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      company = element.text().trim();

      // If this is from the page title, clean it up
      if (selector === 'title') {
        // Page titles often follow patterns like "Job Title - Company" or "Job Title | Company"
        const parts = company.split(/[-|]/);
        if (parts.length > 1) {
          company = parts[parts.length - 1].trim();
        }
      }

      if (company) break;
    }
  }

  // Look for company logo alt text as a fallback
  if (!company) {
    $('img[alt*="logo"], [role="img"]').each((i, el) => {
      const alt = $(el).attr('alt');
      if (alt && alt.includes('logo')) {
        const match = alt.match(/(.+?)\s+logo/i);
        if (match && match[1]) {
          company = match[1].trim();
          return false; // break each loop
        }
      }
    });
  }

  // Clean up
  return company
    .replace(/[\n\t\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/careers|jobs|careers at|jobs at/gi, '')
    .trim();
}

/**
 * Extract location from the page
 */
function extractLocation($) {
  // Try different common selectors for locations
  const selectors = [
    '.location',
    '.job-location',
    '[data-testid="location"]',
    '[data-automation="job-location"]',
    'div:contains("Location")', 'span:contains("Location")',
  ];

  let location = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      location = element.text().trim();

      // Extract just the location part if it contains prefixes like "Location: "
      if (location.toLowerCase().includes('location:')) {
        location = location.split('Location:')[1].trim();
      }

      if (location) break;
    }
  }

  // Clean up
  return location
    .replace(/[\n\t\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract employment type (full-time, part-time, etc.)
 */
function extractEmploymentType($) {
  // Try different common selectors for employment types
  const selectors = [
    '.job-type', '.jobType',
    '.employment-type', '.employmentType',
    '[data-testid="employmentType"]',
    '[data-automation="job-type"]',
    'div:contains("Employment Type")', 'span:contains("Employment Type")',
    'div:contains("Job Type")', 'span:contains("Job Type")',
  ];

  let employmentType = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      employmentType = element.text().trim();

      // Extract just the type part if it contains prefixes
      if (employmentType.toLowerCase().includes('employment type:')) {
        employmentType = employmentType.split('Employment Type:')[1].trim();
      } else if (employmentType.toLowerCase().includes('job type:')) {
        employmentType = employmentType.split('Job Type:')[1].trim();
      }

      if (employmentType) break;
    }
  }

  // Try to parse the entire page for common employment type phrases
  if (!employmentType) {
    const fullText = $('body').text().toLowerCase();
    if (fullText.includes('full-time') || fullText.includes('full time')) {
      employmentType = 'Full-time';
    } else if (fullText.includes('part-time') || fullText.includes('part time')) {
      employmentType = 'Part-time';
    } else if (fullText.includes('contract')) {
      employmentType = 'Contract';
    } else if (fullText.includes('internship')) {
      employmentType = 'Internship';
    } else if (fullText.includes('freelance')) {
      employmentType = 'Freelance';
    } else {
      employmentType = 'Full-time'; // Default
    }
  }

  // Clean up
  return employmentType
    .replace(/[\n\t\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract location type (remote, on-site, hybrid)
 */
function extractLocationType($) {
  // Try different common selectors
  const selectors = [
    '.remote', '.work-type',
    '.location-type', '.locationType',
    '[data-testid="locationType"]',
    '[data-automation="location-type"]',
  ];

  let locationType = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      locationType = element.text().trim().toLowerCase();
      break;
    }
  }

  // If not found via selectors, search the text
  if (!locationType) {
    const bodyText = $('body').text().toLowerCase();
    if (bodyText.includes('remote')) {
      locationType = 'Remote';
    } else if (bodyText.includes('hybrid')) {
      locationType = 'Hybrid';
    } else if (bodyText.includes('on-site') || bodyText.includes('onsite') || bodyText.includes('on site')) {
      locationType = 'On-site';
    } else {
      locationType = 'Not specified';
    }
  } else {
    // Convert from the found text to a standard format
    if (locationType.includes('remote')) {
      locationType = 'Remote';
    } else if (locationType.includes('hybrid')) {
      locationType = 'Hybrid';
    } else if (locationType.includes('on-site') || locationType.includes('onsite') || locationType.includes('on site')) {
      locationType = 'On-site';
    } else {
      locationType = 'Not specified';
    }
  }

  return locationType;
}

/**
 * Extract salary information from the page
 * @returns {Object|null} Object with wagesMin, wagesMax, and wageType or null
 */
function extractSalary($) {
  // Try different common selectors for salary
  const selectors = [
    '.salary', '.compensation',
    '.pay-range', '.payRange',
    '[data-testid="salary"]',
    '[data-automation="salary-range"]',
    'div:contains("Salary")', 'span:contains("Salary")',
    'div:contains("Compensation")', 'span:contains("Compensation")',
  ];

  let salaryText = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      salaryText = element.text().trim();

      // Extract just the salary part if it contains prefixes
      if (salaryText.toLowerCase().includes('salary:')) {
        salaryText = salaryText.split('Salary:')[1].trim();
      } else if (salaryText.toLowerCase().includes('compensation:')) {
        salaryText = salaryText.split('Compensation:')[1].trim();
      }

      if (salaryText) break;
    }
  }

  // If no salary text found, search for dollar amounts in the page
  if (!salaryText) {
    // Look for text with dollar signs that might indicate salary
    $('body *').each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes('$') &&
         (text.includes('per ') ||
          text.includes('/') ||
          text.includes('salary') ||
          text.includes('compensation') ||
          text.includes('range'))) {
        salaryText = text;
        return false; // Break the loop
      }
    });
  }

  // Try to parse the salary text if found
  if (salaryText) {
    // Extract dollar amounts
    const salaryMatch = salaryText.match(/\$([0-9,.]+)(?:\s*-\s*\$?([0-9,.]+))?/);

    if (salaryMatch) {
      // Remove commas and convert to numbers
      const wagesMin = parseInt(salaryMatch[1].replace(/,/g, ''), 10);
      // If there's a range, extract the max, otherwise min=max
      const wagesMax = salaryMatch[2] ? parseInt(salaryMatch[2].replace(/,/g, ''), 10) : wagesMin;

      // Determine if hourly, yearly, etc.
      let wageType = 'Yearly'; // Default
      const lowerText = salaryText.toLowerCase();

      if (lowerText.includes('hour') || lowerText.includes('/hr') || lowerText.includes('/ hr')) {
        wageType = 'Hourly';
      } else if (lowerText.includes('week')) {
        wageType = 'Weekly';
      } else if (lowerText.includes('month')) {
        wageType = 'Monthly';
      } else if (lowerText.includes('year') || lowerText.includes('annual') || lowerText.includes('/yr') || lowerText.includes('/ yr')) {
        wageType = 'Yearly';
      }

      return { wagesMin, wagesMax, wageType };
    }
  }

  return null;
}

/**
 * Extract job description from the page
 */
function extractDescription($) {
  // Try different common selectors for job descriptions
  const selectors = [
    '.description', '.job-description',
    '.details', '.job-details',
    '[data-testid="jobDescription"]',
    '[data-automation="job-description"]',
  ];

  let description = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      // Remove any script tags first for security
      element.find('script').remove();
      element.find('style').remove();

      description = element.text().trim();
      if (description) break;
    }
  }

  // If specific selectors failed, try a more generic approach
  if (!description) {
    $('div, section').each((i, el) => {
      const $el = $(el);
      // Skip elements with script tags
      if ($el.find('script').length > 0) return;

      const text = $el.text().trim();
      // Job descriptions are typically long
      if (text.length > 200 && text.includes('.') && !description) {
        description = text;
      }
    });
  }

  // Clean up
  return description
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
    .trim();
}

/**
 * Extract external job ID from the page or URL
 */
function extractExternalJobId($, url) {
  // Try to extract from URL parameters or path segments
  try {
    const urlObj = new URL(url);

    // Check for common job ID parameters
    const searchParams = urlObj.searchParams;
    const jobIdParams = ['jobId', 'id', 'job_id', 'jid', 'opportunityId'];

    for (const param of jobIdParams) {
      if (searchParams.has(param)) {
        return searchParams.get(param);
      }
    }

    // Check URL path for IDs
    const pathSegments = urlObj.pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];

    // If last segment looks like an ID (alphanumeric, possibly with dashes)
    if (lastSegment && /^[a-zA-Z0-9-_]+$/.test(lastSegment) && lastSegment.length > 3) {
      return lastSegment;
    }
  } catch (error) {
    console.error('Error extracting job ID from URL:', error);
  }

  // Try to find job ID in page content
  const jobIdSelectors = [
    '[data-job-id]', '[data-posting-id]',
    '[data-requisition-id]', '[data-req-id]',
    '[data-testid="job-id"]',
    'div:contains("Job ID")', 'span:contains("Job ID")',
    'div:contains("Requisition")', 'span:contains("Requisition")',
  ];

  for (const selector of jobIdSelectors) {
    const element = $(selector).first();
    if (element.length) {
      // Try to get the ID from various attributes
      const idAttrs = ['data-job-id', 'data-posting-id', 'data-requisition-id', 'data-req-id', 'id'];
      for (const attr of idAttrs) {
        const id = element.attr(attr);
        if (id) return id;
      }

      // Maybe the ID is in the text
      const text = element.text().trim();
      const idMatch = text.match(/\b([A-Z0-9-_]{4,})\b/);
      if (idMatch && idMatch[1]) {
        return idMatch[1];
      }
    }
  }

  return '';
}

/**
 * Queue a job for enrichment
 * @param {string} url - URL of the job posting
 * @param {Object} jobData - Basic job data
 */
exports.queueJobForEnrichment = async (url, jobData) => {
  // If Redis is available, use it; otherwise use in-memory queue
  if (redisClient) {
    await redisClient.rpush('job-enrichment-queue', JSON.stringify({
      url,
      jobData,
      queuedAt: new Date().toISOString()
    }));
    console.log(`Queued job for enrichment in Redis: ${url}`);
  } else {
    enrichmentQueue.push({
      url,
      jobData,
      queuedAt: new Date().toISOString()
    });
    console.log(`Queued job for enrichment in memory: ${url}`);
  }

  // If not already processing, start the queue processor
  if (!isProcessing) {
    processEnrichmentQueue();
  }

  return true;
};

/**
 * Store job ID for the given URL to update it later after enrichment
 * @param {string} url - URL of the job posting
 * @param {string} jobId - MongoDB ID of the job
 */
exports.storeJobIdForEnrichment = async (url, jobId) => {
  // If Redis is available, use it; otherwise use in-memory map
  if (redisClient) {
    await redisClient.hset('job-enrichment-map', url, jobId.toString());
  } else {
    enrichmentMap.set(url, jobId.toString());
  }
};

/**
 * Process the enrichment queue with delay between requests
 */
exports.processEnrichmentQueue = async () => {
  // If already processing, don't start another processor
  if (isProcessing) {
    return { processed: 0, errors: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let errors = 0;

  try {
    // Process from Redis or memory
    if (redisClient) {
      // Process until queue is empty
      while (true) {
        const queueItem = await redisClient.lpop('job-enrichment-queue');
        if (!queueItem) break;

        try {
          const { url, jobData } = JSON.parse(queueItem);
          await processEnrichmentItem(url, jobData);
          processed++;
        } catch (error) {
          console.error('Error processing enrichment item from Redis:', error);
          errors++;
        }

        // Add delay between requests
        await sleep(REQUEST_DELAY_MS);
      }
    } else {
      // Process in-memory queue
      while (enrichmentQueue.length > 0) {
        const queueItem = enrichmentQueue.shift();
        try {
          await processEnrichmentItem(queueItem.url, queueItem.jobData);
          processed++;
        } catch (error) {
          console.error('Error processing enrichment item from memory:', error);
          errors++;
        }

        // Add delay between requests
        await sleep(REQUEST_DELAY_MS);
      }
    }
  } catch (error) {
    console.error('Error processing enrichment queue:', error);
  } finally {
    isProcessing = false;
  }

  return { processed, errors };
};

/**
 * Process a single enrichment item
 * @param {string} url - URL to process
 * @param {Object} basicJobData - Basic job data
 */
async function processEnrichmentItem(url, basicJobData) {
  try {
    console.log(`Processing enrichment for: ${url}`);

    // Extract job data from the website
    const extractedData = await exports.extractJobData(url);

    if (!extractedData) {
      console.log(`No data extracted from ${url}`);
      return;
    }

    // Find the job ID that corresponds to this URL
    let jobId;
    if (redisClient) {
      jobId = await redisClient.hget('job-enrichment-map', url);
      // Remove from map after retrieval
      await redisClient.hdel('job-enrichment-map', url);
    } else {
      jobId = enrichmentMap.get(url);
      // Remove from map after retrieval
      enrichmentMap.delete(url);
    }

    if (!jobId) {
      console.log(`No job ID found for URL: ${url}`);
      return;
    }

    // Update job with enriched data
    await updateJobWithEnrichedData(jobId, extractedData);
    console.log(`Successfully updated job ${jobId} with enriched data from ${url}`);
  } catch (error) {
    console.error(`Error processing enrichment for ${url}:`, error);
    throw error; // re-throw to be caught by processEnrichmentQueue
  }
}

/**
 * Update a job with enriched data
 * @param {string} jobId - MongoDB ID of the job
 * @param {Object} enrichedData - Enriched data to update
 */
async function updateJobWithEnrichedData(jobId, enrichedData) {
  // Find and update the job
  const job = await Job.findById(jobId);

  if (!job) {
    console.log(`Job not found with ID: ${jobId}`);
    return false;
  }

  // Update job fields if the enriched data has them and they're not already in the job
  if (enrichedData.jobTitle && (!job.jobTitle || job.jobTitle === `Position at ${job.company}`)) {
    job.jobTitle = enrichedData.jobTitle;
  }

  if (enrichedData.company && (!job.company || job.company === 'Unknown Company')) {
    job.company = enrichedData.company;
  }

  if (enrichedData.companyLocation && !job.companyLocation) {
    job.companyLocation = enrichedData.companyLocation;
  }

  if (enrichedData.locationType) {
    job.locationType = enrichedData.locationType;
  }

  if (enrichedData.employmentType) {
    job.employmentType = enrichedData.employmentType;
  }

  if (enrichedData.wagesMin && enrichedData.wageType) {
    job.wagesMin = enrichedData.wagesMin;
    job.wagesMax = enrichedData.wagesMax || enrichedData.wagesMin;
    job.wageType = enrichedData.wageType;
  }

  if (enrichedData.description && !job.description) {
    job.description = enrichedData.description;
  }

  if (enrichedData.externalJobId && !job.externalJobId) {
    job.externalJobId = enrichedData.externalJobId;
  }

  // Add enrichment timestamp
  job.enriched = new Date();

  // Save the job
  await job.save();

  return true;
}

/**
 * Helper function to sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}