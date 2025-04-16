const xlsx = require('xlsx');
const Job = require('../models/Job');
const linkedInService = require('./linkedInEnrichmentService');
const linkedInUtils = require('../utils/linkedInUtils');
const emailUtils = require('../utils/emailUtils');

/**
 * Extract hyperlinks from Excel worksheet
 * @param {Object} worksheet - XLSX worksheet
 * @returns {Object} Map of cell references to hyperlinks
 */
exports.extractHyperlinks = (worksheet) => {
  const hyperlinkMap = {};

  // Loop through cells to find hyperlinks
  Object.keys(worksheet).forEach(cell => {
    // Skip non-cell properties (starting with !)
    if (cell[0] === '!') return;

    // Check if the cell has a hyperlink property
    const cellData = worksheet[cell];
    if (cellData.l && cellData.l.Target) {
      // Store the hyperlink with cell reference as key
      hyperlinkMap[cell] = cellData.l.Target;
    }
  });

  return hyperlinkMap;
};

/**
 * Map Excel data to job model structure
 * @param {Array} excelData - Raw data from Excel
 * @param {Object} hyperlinkMap - Map of cell references to hyperlinks
 * @returns {Array} Mapped job data
 */
exports.mapExcelDataToJobModel = (excelData, hyperlinkMap) => {
  return excelData.map((row, rowIndex) => {
    // Handle status checks if available
    let statusChecks = [];
    if (row['Status Checks']) {
      try {
        statusChecks = JSON.parse(row['Status Checks']);
        // Also parse dates within status checks
        statusChecks = statusChecks.map(check => ({
          ...check,
          date: check.date ? emailUtils.parseExcelDate(check.date) : new Date()
        }));
      } catch (e) {
        console.error('Error parsing Status Checks:', e);
      }
    }

    // Find the Website cell reference for this row to extract hyperlink
    let websiteUrl = row.Website;

    // Determine the column index for 'Website'
    const columnsOrder = Object.keys(excelData[0]);
    const websiteColIndex = columnsOrder.indexOf('Website');

    if (websiteColIndex !== -1) {
      // Excel uses 0-indexed for rows internally but 1-indexed in the cell references
      // Add 1 to rowIndex for Excel's 1-indexed rows, and add 1 for header row
      const rowNum = rowIndex + 2;

      // Convert column index to Excel column letter (A, B, C, etc.)
      const colLetter = xlsx.utils.encode_col(websiteColIndex);

      // Construct the cell reference (e.g., "C5")
      const cellRef = colLetter + rowNum;

      // Check if this cell has a hyperlink
      if (hyperlinkMap[cellRef]) {
        websiteUrl = hyperlinkMap[cellRef];
      }
    }

    const formattedWebsiteUrl = linkedInUtils.formatWebsiteUrl(websiteUrl);

    // Create job data object
    const jobData = {
      source: row.Source || 'Excel Import',
      searchType: row['Search Type'],
      applicationThrough: row['Application Through'] || 'Other',
      company: row.Company || '',
      companyLocation: row['Company Location'] || row.Location || '',
      locationType: row['Location Type'] || 'Remote',
      employmentType: row['Employment Type'] || 'Full-time',
      jobTitle: row['Job Title'] || row.Title || '',
      wagesMin: row.Wages || row.WagesMin || row['Minimum Salary'] || null,
      wagesMax: row['Wages Max'] || row.WagesMax || row['Maximum Salary'] || null,
      wageType: row['Wage Type'] || 'Yearly',
      applied: emailUtils.parseExcelDate(row.Applied) || new Date(),
      statusChecks: statusChecks,
      // Properly handle responded as a date field that can be null
      responded: row.Responded ? emailUtils.parseExcelDate(row.Responded) : null,
      response: row.Response || 'No Response',
      website: formattedWebsiteUrl,
      description: row.Description || '',
      externalJobId: row['External Job ID'] || row.ExternalJobId || '',
      notes: row.Notes || `Imported from Excel on ${new Date().toLocaleDateString()}`
    };

    // Queue LinkedIn URLs for enrichment if applicable
    if (formattedWebsiteUrl && formattedWebsiteUrl.includes('linkedin.com/jobs/view')) {
      const jobId = linkedInUtils.extractJobIdFromUrl(formattedWebsiteUrl);
      if (jobId) {
        jobData.externalJobId = jobData.externalJobId || jobId;
      }

      linkedInService.queueJobForEnrichment(formattedWebsiteUrl, {
        externalJobId: jobData.externalJobId || `excel-${Date.now()}-${jobData.company || 'unknown'}`,
        jobTitle: jobData.jobTitle,
        company: jobData.company
      });
    }

    return jobData;
  });
};

/**
 * Save job data to database
 * @param {Array} jobDataList - List of job data objects to save
 * @returns {Promise<Object>} Statistics about saved jobs
 */
exports.saveJobsToDatabase = async (jobDataList) => {
  const savedJobs = [];
  let errorCount = 0;
  let duplicateCount = 0;

  for (const jobData of jobDataList) {
    try {
      // Only require the mandatory fields
      if (!jobData.company) {
        errorCount++;
        continue;
      }

      // Check if job already exists
      let existingJob = null;

      if (jobData.externalJobId) {
        existingJob = await Job.findOne({ externalJobId: jobData.externalJobId });
      }

      if (!existingJob && jobData.company && jobData.jobTitle) {
        existingJob = await Job.findOne({
          company: jobData.company,
          jobTitle: jobData.jobTitle
        });
      }

      if (existingJob) {
        duplicateCount++;
        continue;
      }

      // Create the job
      const newJob = new Job(jobData);
      const savedJob = await newJob.save();
      savedJobs.push(savedJob);
    } catch (error) {
      console.error('Error saving job:', error);
      errorCount++;
    }
  }

  return {
    savedJobs,
    stats: {
      added: savedJobs.length,
      duplicates: duplicateCount,
      errors: errorCount,
      total: jobDataList.length
    }
  };
};

/**
 * Process Excel file and import jobs
 * @param {string} filePath - Path to Excel file
 * @returns {Promise<Object>} Import results
 */
exports.processExcelFile = async (filePath) => {
  // Read the Excel file with cellStyles to capture hyperlinks
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    cellStyles: true,
    cellNF: true,
    cellHTML: true
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON with raw values to properly handle dates
  const excelData = xlsx.utils.sheet_to_json(worksheet, { raw: true });

  if (excelData.length === 0) {
    throw new Error('Excel file has no data');
  }

  // Extract hyperlinks from the worksheet
  const hyperlinkMap = exports.extractHyperlinks(worksheet);

  // Map Excel data to job model structure
  const mappedData = exports.mapExcelDataToJobModel(excelData, hyperlinkMap);

  // Process LinkedIn enrichment queue after collecting all jobs
  const enrichedJobs = await linkedInService.processEnrichmentQueue();
  let enrichedCount = 0;

  // Apply enrichments to jobs
  if (enrichedJobs.length > 0) {
    mappedData.forEach((job, index) => {
      const matchingEnrichment = enrichedJobs.find(enriched =>
        (job.externalJobId && job.externalJobId === enriched.externalJobId) ||
        (job.website && enriched.externalJobId && job.website.includes(enriched.externalJobId))
      );

      if (matchingEnrichment) {
        // Apply enrichment to the job data
        const enrichedJob = linkedInService.applyEnrichmentToJob(job, matchingEnrichment.enrichedData);
        mappedData[index] = enrichedJob;

        // Add note about enrichment
        if (!mappedData[index].notes.includes('Enriched with LinkedIn data')) {
          mappedData[index].notes += '\nEnriched with LinkedIn data';
        }

        enrichedCount++;
      }
    });
  }

  // Save jobs to database
  const saveResult = await exports.saveJobsToDatabase(mappedData);

  return {
    ...saveResult,
    enrichedCount,
    stats: {
      ...saveResult.stats,
      enriched: enrichedCount
    }
  };
};
