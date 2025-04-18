/**
 * Service to extract job data from web pages
 * Similar to linkedInEnrichmentService but for general web pages
 */
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');

/**
 * Extract job data from a web page
 * @param {string} url URL of the job posting
 * @returns {Promise<Object|null>} Extracted job data or null if extraction failed
 */
exports.extractJobDataFromWebsite = async (url) => {
  if (!url) {
    console.log('No URL provided for job data extraction');
    return null;
  }

  console.log(`Extracting job data from URL: ${url}`);

  try {
    // Make request to the job page
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

    // Extract job title - try several common patterns
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
    '.company-name', '.companyName',
    '.employer', '.organization',
    '.company',
    '[data-testid="company"]',
    '[data-automation="company-name"]',
    '.job-company', '.jobCompany',
    // Company often appears in a subtitle below the job title
    'h1 + div', 'h1 + p', 'h1 ~ .subtitle',
    // Look for img alt text containing "logo"
    'img[alt*="logo"]'
  ];

  let company = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      if (selector === 'img[alt*="logo"]') {
        // Extract company name from alt text like "Company Name logo"
        const alt = element.attr('alt');
        if (alt && alt.includes('logo')) {
          company = alt.replace(/\slogo$/i, '').trim();
        }
      } else {
        company = element.text().trim();
      }

      if (company) break;
    }
  }

  // Clean up
  return company
    .replace(/[\n\t\r]+/g, ' ')     // Replace line breaks with spaces
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
    .trim();
}

/**
 * Extract location from the page
 */
function extractLocation($) {
  // Try different common selectors for locations
  const selectors = [
    '.job-location', '.jobLocation',
    '.location', '.company-location',
    '[data-testid="location"]',
    '[data-automation="job-location"]',
    // Location often appears near company name
    '.company + .location', '.company ~ .location',
    '.company-name + div', '.company-name ~ div',
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
    .replace(/[\n\t\r]+/g, ' ')     // Replace line breaks with spaces
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
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

      // Extract just the type part if it contains prefixes like "Employment Type: "
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
    .replace(/[\n\t\r]+/g, ' ')     // Replace line breaks with spaces
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
    .trim();
}

/**
 * Extract location type (remote, on-site, hybrid)
 */
function extractLocationType($) {
  // Try different common selectors for location types
  const selectors = [
    '.remote', '.location-type',
    '.locationType', '.work-type',
    '[data-testid="locationType"]',
    '[data-automation="location-type"]',
  ];

  let locationType = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      locationType = element.text().trim();
      if (locationType) break;
    }
  }

  // Fallback: Search page text for common location type words
  if (!locationType) {
    const fullText = $('body').text().toLowerCase();
    if (fullText.includes('remote')) {
      locationType = 'Remote';
    } else if (fullText.includes('hybrid')) {
      locationType = 'Hybrid';
    } else if (fullText.includes('on-site') || fullText.includes('on site') || fullText.includes('onsite')) {
      locationType = 'On-site';
    } else {
      locationType = ''; // Don't set a default
    }
  }

  // Clean up
  return locationType
    .replace(/[\n\t\r]+/g, ' ')     // Replace line breaks with spaces
    .replace(/\s{2,}/g, ' ')       // Replace multiple spaces with a single space
    .trim();
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
    const amounts = salaryText.match(/\$\s*([0-9,.]+)/g);
    if (amounts && amounts.length) {
      // Clean up amount strings and convert to numbers
      const cleanAmounts = amounts.map(a =>
        parseInt(a.replace(/[$,]/g, ''), 10)
      ).filter(a => !isNaN(a)).sort((a, b) => a - b);

      if (cleanAmounts.length) {
        const wagesMin = cleanAmounts[0];
        const wagesMax = cleanAmounts.length > 1 ? cleanAmounts[cleanAmounts.length - 1] : wagesMin;

        // Determine wage type
        let wageType = 'Yearly'; // Default
        const lowerText = salaryText.toLowerCase();

        if (lowerText.includes('/hr') || lowerText.includes(' per hour') || lowerText.includes('/hour')) {
          wageType = 'Hourly';
        } else if (lowerText.includes('/mo') || lowerText.includes(' per month') || lowerText.includes('/month')) {
          wageType = 'Monthly';
        } else if (lowerText.includes('/wk') || lowerText.includes(' per week') || lowerText.includes('/week')) {
          wageType = 'Weekly';
        }

        return { wagesMin, wagesMax, wageType };
      }
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
    '.job-description', '.jobDescription',
    '.description', '.details',
    '.job-details', '.jobDetails',
    '[data-testid="jobDescription"]',
    '[data-automation="job-description"]',
    // Common container classes that might contain the description
    '.job-details-content', '.jobDetailsContent',
    '#job-details', '#jobDetails',
    '.details-section', '.detailsSection',
  ];

  let description = '';

  // Try each selector
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length) {
      description = element.text().trim();
      if (description) break;
    }
  }

  // If no description found, look for long text blocks that might be the description
  if (!description) {
    $('div, section').each((i, el) => {
      const text = $(el).text().trim();
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
    '[data-testid="job-id"]'
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
      if (text.length > 0 && text.length < 50) {
        return text;
      }
    }
  }

  // If we couldn't find an ID, generate one from URL
  const urlHash = Buffer.from(url).toString('base64').substring(0, 10);
  return `url-${urlHash}`;
}