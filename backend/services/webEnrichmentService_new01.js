/**
 * Web Enrichment Service - Enriches job data from web sources
 *
 * This service is designed to:
 * 1. Extract job details from public web pages
 * 2. Get additional data from LinkedIn for job listings
 * 3. Handle rate limiting and request throttling
 * 4. Queue enrichment requests to process in the background
 */
const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');

// Queue for job enrichment requests
const enrichmentQueue = [];

// Rate limiting settings
const DELAY_BETWEEN_REQUESTS = 700; // ms
const MAX_CONCURRENT_REQUESTS = 2;

// Enrichment status tracking
let isProcessing = false;
let processed = 0;
let totalQueued = 0;

/**
 * Queue a job for enrichment with web data
 * @param {string} jobId - ID of the job to enrich
 * @param {string} url - URL to extract data from
 * @param {string} type - Type of enrichment ('linkedin' or 'generic')
 */
exports.queueJobForEnrichment = (jobId, url, type = 'generic') => {
  enrichmentQueue.push({
    jobId,
    url,
    type,
    addedAt: new Date()
  });

  totalQueued++;

  // Start processing if not already running
  if (!isProcessing) {
    this.processEnrichmentQueue();
  }
};

/**
 * Process the enrichment queue
 */
exports.processEnrichmentQueue = async () => {
  // Set processing flag
  isProcessing = true;
  processed = 0;

  console.log(`Starting enrichment process. Queue size: ${enrichmentQueue.length}`);

  try {
    // Process queue items with rate limiting
    while (enrichmentQueue.length > 0) {
      const item = enrichmentQueue.shift();

      try {
        const enrichedData = await enrichJobData(item.jobId, item.url, item.type);

        if (enrichedData) {
          await updateJob(item.jobId, enrichedData);
        }

        processed++;
      } catch (error) {
        console.error(`Error enriching job ${item.jobId}:`, error);
      }

      // Rate limiting delay between requests
      await delay(DELAY_BETWEEN_REQUESTS);
    }
  } catch (error) {
    console.error('Error in enrichment queue processing:', error);
  } finally {
    isProcessing = false;
    console.log(`Enrichment process completed. Processed ${processed} jobs.`);
  }
};

/**
 * Get current enrichment status
 * @returns {Object} Status information
 */
exports.getEnrichmentStatus = () => {
  return {
    isProcessing,
    queueSize: enrichmentQueue.length,
    processed,
    totalQueued
  };
};

/**
 * Enrich a single URL immediately (for on-demand enrichment)
 * @param {string} url - URL to extract data from
 * @param {string} type - Type of enrichment ('linkedin' or 'generic')
 * @returns {Promise<Object>} Enriched job data
 */
exports.enrichUrl = async (url, type = 'generic') => {
  try {
    if (type === 'linkedin') {
      return await enrichLinkedInJob(url);
    } else {
      return await enrichGenericJob(url);
    }
  } catch (error) {
    console.error('Error enriching URL:', error);
    throw error;
  }
};

/**
 * Process all enrichment for a specific job
 * @param {string} jobId - ID of the job to enrich
 * @param {string} url - URL to extract data from
 * @param {string} type - Type of enrichment ('linkedin' or 'generic')
 * @returns {Promise<Object>} Enriched job data
 */
async function enrichJobData(jobId, url, type) {
  try {
    if (!url) return null;

    if (type === 'linkedin') {
      return await enrichLinkedInJob(url);
    } else {
      return await enrichGenericJob(url);
    }
  } catch (error) {
    console.error(`Error enriching job ${jobId}:`, error);
    return null;
  }
}

/**
 * Enrich job with data from LinkedIn
 * @param {string} url - LinkedIn job URL
 * @returns {Promise<Object>} Enriched job data
 */
async function enrichLinkedInJob(url) {
  try {
    // Extract job ID from URL
    const jobId = extractJobIdFromUrl(url);
    if (!jobId) return null;

    // Check if URL is for a job view
    if (!url.includes('/jobs/view/')) {
      return await enrichGenericJob(url);
    }

    // Use LinkedIn's public non-authenticated API
    const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      },
      timeout: 15000
    });

    // Parse the HTML response
    const $ = cheerio.load(response.data);

    // Extract job details
    const jobDetails = {
      jobTitle: $('.top-card-layout__title').text().trim(),
      company: $('.topcard__org-name-link').text().trim() || $('.top-card-layout__company-name').text().trim(),
      companyLocation: $('.topcard__flavor--bullet').text().trim() || $('.top-card-layout__location').text().trim(),
      description: $('.description__text').html() || $('.show-more-less-html__markup').html()
    };

    // Extract location type
    const locationText = $('.topcard__flavor--bullet').text().toLowerCase() || $('.top-card-layout__location').text().toLowerCase();
    if (locationText.includes('remote')) {
      jobDetails.locationType = 'Remote';
    } else if (locationText.includes('hybrid')) {
      jobDetails.locationType = 'Hybrid';
    } else {
      jobDetails.locationType = 'On-site';
    }

    // Extract employment type
    const criteriaList = $('.description__job-criteria-list');
    criteriaList.find('.description__job-criteria-item').each((i, elem) => {
      const header = $(elem).find('.description__job-criteria-subheader').text().trim();
      const value = $(elem).find('.description__job-criteria-text').text().trim();

      if (header.includes('Employment type')) {
        jobDetails.employmentType = mapEmploymentType(value);
      } else if (header.includes('Seniority level')) {
        jobDetails.notes = `${jobDetails.notes || ''}\nSeniority: ${value}`;
      }
    });

    // Extract salary if available
    const salaryText = $('.compensation__salary-range').text().trim();
    if (salaryText) {
      const salaryData = parseSalaryText(salaryText);
      if (salaryData) {
        jobDetails.wagesMin = salaryData.min;
        jobDetails.wagesMax = salaryData.max;
        jobDetails.wageType = salaryData.type;
      }
    }

    // Add external job ID
    jobDetails.externalJobId = jobId;

    return jobDetails;
  } catch (error) {
    console.error('Error enriching LinkedIn job:', error);

    // Fall back to generic job enrichment if LinkedIn API fails
    return await enrichGenericJob(url);
  }
}

/**
 * Enrich job with data from a generic web page
 * @param {string} url - Job posting URL
 * @returns {Promise<Object>} Enriched job data
 */
async function enrichGenericJob(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });

    // Parse the HTML response
    const $ = cheerio.load(response.data);

    // Extract job details using common selectors
    const title = $('h1').first().text().trim() || $('title').text().split('|')[0].trim();

    // Look for company name in common locations
    let company = '';
    const companySelectors = [
      '.company-name',
      '.employer',
      '[itemprop="hiringOrganization"]',
      'meta[property="og:site_name"]'
    ];

    for (const selector of companySelectors) {
      const found = $(selector).first().text().trim();
      if (found) {
        company = found;
        break;
      }
    }

    // Try to extract company from meta tags if not found
    if (!company) {
      company = $('meta[property="og:site_name"]').attr('content') || '';
    }

    // Look for job description
    const description = $('.job-description').html() ||
                        $('#job-description').html() ||
                        $('[itemprop="description"]').html() ||
                        $('.description').html();

    // Look for location
    const location = $('.location').first().text().trim() ||
                     $('[itemprop="jobLocation"]').text().trim() ||
                     $('[data-testid="job-location"]').text().trim();

    // Determine employment type from description
    let employmentType = '';
    const descriptionText = $('.job-description').text().toLowerCase() ||
                           $('#job-description').text().toLowerCase() ||
                           $('[itemprop="description"]').text().toLowerCase();

    if (descriptionText.includes('full time') || descriptionText.includes('full-time')) {
      employmentType = 'Full-time';
    } else if (descriptionText.includes('part time') || descriptionText.includes('part-time')) {
      employmentType = 'Part-time';
    } else if (descriptionText.includes('contract')) {
      employmentType = 'Contract';
    } else if (descriptionText.includes('intern') || descriptionText.includes('internship')) {
      employmentType = 'Internship';
    } else if (descriptionText.includes('freelance')) {
      employmentType = 'Freelance';
    }

    // Determine location type from description
    let locationType = '';
    if (descriptionText.includes('remote')) {
      locationType = 'Remote';
    } else if (descriptionText.includes('hybrid')) {
      locationType = 'Hybrid';
    } else if (descriptionText.includes('on site') || descriptionText.includes('on-site') || descriptionText.includes('onsite')) {
      locationType = 'On-site';
    }

    // Extract salary information
    const salaryInfo = extractSalaryInfo(descriptionText);

    return {
      jobTitle: title || null,
      company: company || null,
      companyLocation: location || null,
      description: description || null,
      employmentType: employmentType || null,
      locationType: locationType || null,
      wagesMin: salaryInfo?.min || null,
      wagesMax: salaryInfo?.max || null,
      wageType: salaryInfo?.type || null
    };
  } catch (error) {
    console.error('Error enriching generic job:', error);
    return null;
  }
}

/**
 * Update a job with enriched data
 * @param {string} jobId - ID of the job to update
 * @param {Object} enrichedData - Enriched job data
 * @returns {Promise<boolean>} Success status
 */
async function updateJob(jobId, enrichedData) {
  try {
    if (!enrichedData) return false;

    const job = await Job.findById(jobId);
    if (!job) return false;

    // Update job fields with enriched data where not already set
    if (enrichedData.jobTitle && !job.jobTitle) job.jobTitle = enrichedData.jobTitle;
    if (enrichedData.company && !job.company) job.company = enrichedData.company;
    if (enrichedData.companyLocation && !job.companyLocation) job.companyLocation = enrichedData.companyLocation;
    if (enrichedData.locationType && !job.locationType) job.locationType = enrichedData.locationType;
    if (enrichedData.employmentType && !job.employmentType) job.employmentType = enrichedData.employmentType;

    // Always update these fields even if already set
    if (enrichedData.description) job.description = enrichedData.description;
    if (enrichedData.externalJobId) job.externalJobId = enrichedData.externalJobId;

    // Only update salary if we found values
    if (enrichedData.wagesMin) job.wagesMin = enrichedData.wagesMin;
    if (enrichedData.wagesMax) job.wagesMax = enrichedData.wagesMax;
    if (enrichedData.wageType) job.wageType = enrichedData.wageType;

    // Add enrichment note
    const enrichmentNote = `Job details enriched on ${new Date().toLocaleDateString()}`;
    job.notes = job.notes ? `${job.notes}\n${enrichmentNote}` : enrichmentNote;

    // Save the updated job
    await job.save();
    return true;
  } catch (error) {
    console.error(`Error updating job ${jobId} with enriched data:`, error);
    return false;
  }
}

/**
 * Extract job ID from LinkedIn URL
 * @param {string} url - LinkedIn job URL
 * @returns {string} Job ID
 */
function extractJobIdFromUrl(url) {
  // Extract job ID from LinkedIn job URL
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Map LinkedIn employment type to standardized value
 * @param {string} type - LinkedIn employment type
 * @returns {string} Standardized employment type
 */
function mapEmploymentType(type) {
  const typeMap = {
    'full-time': 'Full-time',
    'full time': 'Full-time',
    'part-time': 'Part-time',
    'part time': 'Part-time',
    'contract': 'Contract',
    'temporary': 'Contract',
    'intern': 'Internship',
    'internship': 'Internship',
    'freelance': 'Freelance'
  };

  const lowerType = type.toLowerCase();
  for (const [key, value] of Object.entries(typeMap)) {
    if (lowerType.includes(key)) {
      return value;
    }
  }

  return type; // If no mapping found, return original
}

/**
 * Parse salary text to extract min, max and type
 * @param {string} salaryText - Salary text
 * @returns {Object} Parsed salary data
 */
function parseSalaryText(salaryText) {
  try {
    const text = salaryText.toLowerCase();

    // Determine salary type
    let wageType = 'Yearly';
    if (text.includes('hour') || text.includes('/hr') || text.includes('per hour')) {
      wageType = 'Hourly';
    } else if (text.includes('month') || text.includes('/mo')) {
      wageType = 'Monthly';
    } else if (text.includes('week') || text.includes('/wk')) {
      wageType = 'Weekly';
    } else if (text.includes('project') || text.includes('flat rate')) {
      wageType = 'Project';
    }

    // Extract numbers
    const numbers = text.match(/\$?(\d+[,\d]*(\.\d+)?)/g) || [];

    if (numbers.length >= 2) {
      // Clean up numbers and convert to integers
      const cleanNumbers = numbers.map(n => parseInt(n.replace(/[$,]/g, '')));
      return {
        min: Math.min(...cleanNumbers),
        max: Math.max(...cleanNumbers),
        type: wageType
      };
    } else if (numbers.length === 1) {
      // Only one number found, use as both min and max
      const value = parseInt(numbers[0].replace(/[$,]/g, ''));
      return {
        min: value,
        max: value,
        type: wageType
      };
    }

    return null;
  } catch (error) {
    console.error('Error parsing salary text:', error);
    return null;
  }
}

/**
 * Extract salary information from job description
 * @param {string} description - Job description text
 * @returns {Object} Salary information
 */
function extractSalaryInfo(description) {
  // Look for common salary patterns in the description
  const salaryPatterns = [
    // $X - $Y per hour/year
    /\$(\d+[,\d]*(\.\d+)?)\s*-\s*\$(\d+[,\d]*(\.\d+)?)\s*(per|\/|\s)(hour|hr|year|yr|month|mo|week|wk)/i,

    // $X per hour/year
    /\$(\d+[,\d]*(\.\d+)?)\s*(per|\/|\s)(hour|hr|year|yr|month|mo|week|wk)/i,

    // X - Y dollars per hour/year
    /(\d+[,\d]*(\.\d+)?)\s*-\s*(\d+[,\d]*(\.\d+)?)\s*(dollars|usd)\s*(per|\/|\s)(hour|hr|year|yr|month|mo|week|wk)/i,

    // X dollars per hour/year
    /(\d+[,\d]*(\.\d+)?)\s*(dollars|usd)\s*(per|\/|\s)(hour|hr|year|yr|month|mo|week|wk)/i
  ];

  for (const pattern of salaryPatterns) {
    const match = description.match(pattern);

    if (match) {
      // Determine wage type
      let wageType = 'Yearly';
      const unitText = match[0].toLowerCase();

      if (unitText.includes('hour') || unitText.includes('/hr') || unitText.includes('per hour')) {
        wageType = 'Hourly';
      } else if (unitText.includes('month') || unitText.includes('/mo')) {
        wageType = 'Monthly';
      } else if (unitText.includes('week') || unitText.includes('/wk')) {
        wageType = 'Weekly';
      }

      // Extract min and max values
      if (match[0].includes('-')) {
        // Range format: X - Y
        const firstNumberIndex = match[0].search(/\d/);
        const dashIndex = match[0].indexOf('-');
        const min = parseFloat(match[0].substring(firstNumberIndex, dashIndex).replace(/[^\d.]/g, ''));

        const secondNumberStart = dashIndex + 1 + match[0].substring(dashIndex + 1).search(/\d/);
        const secondNumberEnd = secondNumberStart + match[0].substring(secondNumberStart).search(/[^\d.,]/);
        const max = parseFloat(match[0].substring(secondNumberStart, secondNumberEnd).replace(/[^\d.]/g, ''));

        return { min, max, type: wageType };
      } else {
        // Single value format
        const firstNumberIndex = match[0].search(/\d/);
        const numberEndIndex = firstNumberIndex + match[0].substring(firstNumberIndex).search(/[^\d.,]/);
        const value = parseFloat(match[0].substring(firstNumberIndex, numberEndIndex).replace(/[^\d.]/g, ''));

        return { min: value, max: value, type: wageType };
      }
    }
  }

  return null;
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}