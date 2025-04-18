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

    // Detect if this is a JavaScript heavy site like UltiPro
    const isJSHeavySite = detectJSHeavySite($);

    if (isJSHeavySite) {
      console.log("Detected JavaScript-heavy job site. Using specialized extraction...");
      jobData = extractFromJSHeavySite($, url);
    } else {
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
    }

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
 * Detect if the site is JavaScript-heavy like UltiPro
 */
function detectJSHeavySite($) {
  // Check for UltiPro
  if ($('script:contains("US.Opportunity")').length > 0 ||
      $('script:contains("opportunity")').text().includes('CandidateOpportunityDetail')) {
    return true;
  }

  // Check for Workday
  if ($('script:contains("Workday")').length > 0 ||
      $('div[data-automation-id="jobPostingHeader"]').length > 0) {
    return true;
  }

  // Check for Greenhouse
  if ($('script:contains("Greenhouse")').length > 0 ||
      $('div.app-wrapper').length > 0) {
    return true;
  }

  return false;
}

/**
 * Extract data from JavaScript-heavy sites by looking for embedded JSON data
 */
function extractFromJSHeavySite($, url) {
  const jobData = {};

  // Try to extract from embedded JSON data which is common in JavaScript-heavy sites
  let jsonData = null;

  // Look for JSON in script tags
  $('script').each((i, el) => {
    const scriptContent = $(el).html();
    if (!scriptContent) return;

    // For UltiPro - Find the opportunity object
    if (scriptContent.includes('US.Opportunity.CandidateOpportunityDetail')) {
      try {
        const matches = scriptContent.match(/CandidateOpportunityDetail\((.*?)\)/s);
        if (matches && matches[1]) {
          const jsonStr = matches[1].trim();
          if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
            jsonData = JSON.parse(jsonStr);
            return false; // break the each loop
          }
        }
      } catch (e) {
        console.log("Error parsing UltiPro JSON:", e.message);
      }
    }

    // General approach - look for any JSON object with job data
    try {
      const jsonMatches = scriptContent.match(/{.*"title".*"description".*}/is);
      if (jsonMatches) {
        try {
          const possibleJson = JSON.parse(jsonMatches[0]);
          if (possibleJson.title || possibleJson.jobTitle) {
            jsonData = possibleJson;
            return false; // break the each loop
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    } catch (e) {
      // Continue to next script tag
    }
  });

  // Process the extracted JSON data
  if (jsonData) {
    console.log("Found embedded JSON data for job");

    // UltiPro specific extraction
    if (jsonData.Title) {
      jobData.jobTitle = jsonData.Title;
    }

    // Prevent HTML content in job data
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
    };

    // Try to extract job description from JSON data
    if (jsonData.Description) {
      jobData.description = stripHtml(jsonData.Description);
    }

    // Extract company - usually comes from URL or page title if not in JSON
    const pageTitle = $('title').text();
    let company = '';

    // Try to get from URL
    try {
      const urlObj = new URL(url);
      const hostParts = urlObj.hostname.split('.');
      if (hostParts.length > 1) {
        // Skip common domains like com, org, etc.
        if (hostParts[0] !== 'www' && hostParts[0] !== 'jobs' && hostParts[0] !== 'careers') {
          company = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
        } else if (hostParts[1] !== 'com' && hostParts[1] !== 'org') {
          company = hostParts[1].charAt(0).toUpperCase() + hostParts[1].slice(1);
        }
      }
    } catch (e) {
      // Continue
    }

    // If we couldn't get from URL, try page title
    if (!company && pageTitle) {
      const titleParts = pageTitle.split(/[|\\-]/);
      if (titleParts.length > 1) {
        company = titleParts[titleParts.length - 1].trim();
      }
    }

    if (company) {
      jobData.company = company;
    }

    // Extract location information
    if (jsonData.Locations && jsonData.Locations.length > 0) {
      const location = jsonData.Locations[0];
      let locationStr = '';

      if (location.Address) {
        const address = location.Address;
        if (address.City) locationStr += address.City;

        if (address.State) {
          if (locationStr) locationStr += ', ';
          locationStr += address.State.Name || address.State.Code;
        }

        if (address.Country && !locationStr.includes(address.Country.Name)) {
          if (locationStr) locationStr += ', ';
          locationStr += address.Country.Name;
        }
      } else if (location.LocalizedName) {
        locationStr = location.LocalizedName;
      }

      if (locationStr) {
        jobData.companyLocation = locationStr;
      }

      // Try to determine if remote
      if (location.LocalizedName &&
          (location.LocalizedName.toLowerCase().includes('remote') ||
           location.LocalizedName.toLowerCase().includes('anywhere'))) {
        jobData.locationType = 'Remote';
      }
    }

    // Extract salary information if available
    const salaryRegex = /\$([0-9,.]+)[\s-]*\$?([0-9,.]+)/;
    const descriptionText = stripHtml(jsonData.Description || '');
    const salaryMatch = descriptionText.match(salaryRegex);

    if (salaryMatch && salaryMatch.length >= 3) {
      jobData.wagesMin = parseInt(salaryMatch[1].replace(/[,$]/g, ''), 10);
      jobData.wagesMax = parseInt(salaryMatch[2].replace(/[,$]/g, ''), 10);

      // Determine wage type based on context
      if (descriptionText.toLowerCase().includes(' annual') ||
          descriptionText.toLowerCase().includes('salary') ||
          descriptionText.toLowerCase().includes(' per year')) {
        jobData.wageType = 'Yearly';
      } else if (descriptionText.toLowerCase().includes(' per hour') ||
                 descriptionText.toLowerCase().includes('/hour') ||
                 descriptionText.toLowerCase().includes('/hr')) {
        jobData.wageType = 'Hourly';
      } else {
        jobData.wageType = 'Yearly'; // Default
      }
    }

    // Extract employment type
    if (jsonData.FullTime === true) {
      jobData.employmentType = 'Full-time';
    } else if (jsonData.FullTime === false) {
      jobData.employmentType = 'Part-time';
    }

    // Extract additional employment type info from description
    if (!jobData.employmentType && descriptionText) {
      if (descriptionText.toLowerCase().includes('contract')) {
        jobData.employmentType = 'Contract';
      } else if (descriptionText.toLowerCase().includes('part-time') ||
                 descriptionText.toLowerCase().includes('part time')) {
        jobData.employmentType = 'Part-time';
      } else if (descriptionText.toLowerCase().includes('full-time') ||
                 descriptionText.toLowerCase().includes('full time')) {
        jobData.employmentType = 'Full-time';
      }
    }

    // Use ID from JSON data
    if (jsonData.Id) {
      jobData.externalJobId = jsonData.Id;
    } else if (jsonData.id) {
      jobData.externalJobId = jsonData.id;
    }
  } else {
    console.log("No embedded JSON data found, trying direct HTML extraction");

    // Fallback to direct HTML extraction for pieces we couldn't get from JSON
    if (!jobData.jobTitle) {
      jobData.jobTitle = extractJobTitle($);
    }

    if (!jobData.company) {
      jobData.company = extractCompany($);
    }

    if (!jobData.companyLocation) {
      jobData.companyLocation = extractLocation($);
    }

    if (!jobData.description) {
      // For JS heavy sites, we need to be more selective with description extraction
      // to avoid getting script content
      const descriptionSelectors = [
        '.job-description',
        '[data-automation="jobDescription"]',
        '.job-info',
        '#content-container'
      ];

      for (const selector of descriptionSelectors) {
        const element = $(selector);
        if (element.length) {
          // Remove any script tags first
          element.find('script').remove();
          element.find('style').remove();

          jobData.description = element.text().trim()
            .replace(/\s{2,}/g, ' ')
            .trim();

          break;
        }
      }
    }
  }

  return jobData;
}

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
      // Remove any script tags
      element.find('script').remove();
      element.find('style').remove();

      description = element.text().trim();
      if (description) break;
    }
  }

  // If no description found, look for long text blocks that might be the description
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
      if (text.length > 0 && text.length < 50) {
        const idMatch = text.match(/([A-Z0-9]{5,})/);
        if (idMatch && idMatch[1]) {
          return idMatch[1];
        }
        return text;
      }
    }
  }

  // If we couldn't find an ID, generate one from URL
  const urlHash = Buffer.from(url).toString('base64').substring(0, 10);
  return `url-${urlHash}`;
}