/**
 * LinkedIn-related utility functions
 */
const dotenv = require('dotenv');

// Ensure environment variables are loaded
dotenv.config();

/**
 * Get LinkedIn rate limiting configuration from environment variables
 * with sensible defaults if not configured
 * @returns {Object} Rate limit configuration object
 */
exports.getRateLimitConfig = () => {
  return {
    requestsPerMinute: parseInt(process.env.LINKEDIN_REQUESTS_PER_MINUTE, 10) || 5,
    maxConsecutiveFailures: parseInt(process.env.LINKEDIN_MAX_CONSECUTIVE_FAILURES, 10) || 3,
    standardDelay: parseInt(process.env.LINKEDIN_STANDARD_DELAY, 10) || 12000,  // Default: 12 seconds between requests
    backoffDelay: parseInt(process.env.LINKEDIN_BACKOFF_DELAY, 10) || 60000     // Default: 1 minute initial backoff
  };
};

/**
 * Extract LinkedIn job ID from URL
 * @param {string} url LinkedIn job URL
 * @returns {string|null} Job ID or null if not found
 */
exports.extractJobIdFromUrl = (url) => {
  if (!url) return null;

  // Clean up the URL - LinkedIn URLs from emails often contain tracking parameters
  let cleanUrl = url;
  if (url.includes('/comm/jobs/view/')) {
    cleanUrl = url.replace('/comm/', '/');
  }

  // Extract job ID from URL
  const idMatch = cleanUrl.match(/\/jobs\/view\/(\d+)/);
  if (!idMatch || !idMatch[1]) {
    return null;
  }

  return idMatch[1];
};

/**
 * Clean and standardize LinkedIn job URL to remove tracking parameters
 * @param {string} url LinkedIn job URL
 * @returns {string|null} Cleaned URL or null if invalid
 */
exports.cleanLinkedInJobUrl = (url) => {
  if (!url) return null;

  try {
    // Extract the job ID
    const jobId = exports.extractJobIdFromUrl(url);
    if (!jobId) {
      console.log(`Could not extract job ID from URL: ${url}`);
      return url; // Return original if we can't extract job ID
    }

    // Create a clean, standardized URL with just the job ID
    const cleanUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
    console.log(`Cleaned LinkedIn URL from: ${url.substring(0, 50)}... to: ${cleanUrl}`);
    return cleanUrl;
  } catch (error) {
    console.error(`Error cleaning LinkedIn URL: ${error.message}`);
    return url; // Return original on error
  }
};

/**
 * Parse salary string to extract min, max, and type
 * @param {string} salaryText Raw salary text
 * @returns {Object|null} Parsed salary information
 */
exports.parseSalaryString = (salaryText) => {
  if (!salaryText) return null;

  console.log(`Parsing salary string: "${salaryText}"`);

  // Try to identify the wage type first
  let type = 'Yearly'; // Default
  if (salaryText.toLowerCase().includes('hour') || salaryText.toLowerCase().includes('/hr') || salaryText.toLowerCase().includes('per hour')) {
    type = 'Hourly';
  } else if (salaryText.toLowerCase().includes('month') || salaryText.toLowerCase().includes('/mo')) {
    type = 'Monthly';
  } else if (salaryText.toLowerCase().includes('week') || salaryText.toLowerCase().includes('/wk')) {
    type = 'Weekly';
  } else if (salaryText.toLowerCase().includes('year') || salaryText.toLowerCase().includes('/yr') || salaryText.toLowerCase().includes('annual')) {
    type = 'Yearly';
  }

  console.log(`Detected wage type: ${type}`);

  // Handle different salary formats:

  // Format 1: Handle standard LinkedIn format like "$120,000.00/yr - $163,000.00/yr"
  const structuredMatch = salaryText.match(/\$([0-9,.]+)(?:\/\w+)?\s*-\s*\$([0-9,.]+)(?:\/\w+)?/);
  if (structuredMatch) {
    let min = parseFloat(structuredMatch[1].replace(/,/g, ''));
    let max = parseFloat(structuredMatch[2].replace(/,/g, ''));
    console.log(`Structured match found: min=${min}, max=${max}, type=${type}`);
    return { min, max, type };
  }

  // Format 2: Handle format like "$120-130K" or "Salary to $120-130K"
  const simplifiedRangeMatch = salaryText.match(/\$(\d+)\s*-\s*(\d+)K/i);
  if (simplifiedRangeMatch) {
    let min = parseInt(simplifiedRangeMatch[1], 10) * 1000;
    let max = parseInt(simplifiedRangeMatch[2], 10) * 1000;
    console.log(`Simplified range match found: min=${min}, max=${max}, type=${type}`);
    return { min, max, type };
  }

  // Format 3: Handle single value with K notation like "$130K"
  const singleKMatch = salaryText.match(/\$(\d+)K/i);
  if (singleKMatch) {
    let value = parseInt(singleKMatch[1], 10) * 1000;
    console.log(`Single K value match found: value=${value}, type=${type}`);
    // For a single value, set both min and max to the same value
    return { min: value, max: value, type };
  }

  // Format 4: Common patterns with complex notation: "$80,000-$100,000 a year", "$25-$35 an hour"
  const rangeMatch = salaryText.match(/\$([0-9,.]+)(?:K)?(?:\s*[-–]\s*\$?([0-9,.]+)(?:K)?)?/i);
  if (!rangeMatch) {
    console.log(`No salary range match found in: "${salaryText}"`);
    return null;
  }

  // Extract min and max values, handling K notation (thousands)
  let min = parseFloat(rangeMatch[1].replace(/,/g, ''));
  let max = rangeMatch[2]
    ? parseFloat(rangeMatch[2].replace(/,/g, ''))
    : min * 1.2; // If no max, estimate 20% above min

  // Handle K notation (e.g., $80K)
  if (salaryText.toLowerCase().includes('k')) {
    if (min < 1000) min *= 1000;
    if (max < 1000) max *= 1000;
  }

  console.log(`Final parsed values: min=${min}, max=${max}, type=${type}`);
  return { min, max, type };
};

/**
 * Format and validate website URL
 * @param {string} url URL to format
 * @returns {string|null} Formatted URL or null if invalid
 */
exports.formatWebsiteUrl = (url) => {
  if (!url) return null;

  // Convert to string in case we have a numeric or other type
  let urlString = String(url).trim();

  // Check if URL is already properly formatted
  if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
    return urlString;
  }

  // Handle Excel's hyperlink format: sometimes Excel stores URLs as =HYPERLINK("url","text")
  const hyperlinkMatch = urlString.match(/=HYPERLINK\("([^"]+)"/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) {
    urlString = hyperlinkMatch[1];
  }

  // If URL doesn't have a protocol, add https://
  if (urlString && !urlString.match(/^[a-zA-Z]+:\/\//)) {
    urlString = 'https://' + urlString;
  }

  // Basic URL validation
  try {
    const url = new URL(urlString);
    return url.toString();
  } catch (e) {
    console.error('Invalid URL format:', urlString, e.message);
    // Return original string if URL parsing fails
    return urlString.startsWith('https://') || urlString.startsWith('http://') ? urlString : null;
  }
};
