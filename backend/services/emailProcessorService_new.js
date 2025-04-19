/**
 * Email Processor Service - Searches and processes job-related emails
 *
 * This service is designed to:
 * 1. Connect to email accounts and search for job-related emails
 * 2. Extract job application details, status updates, and responses
 * 3. Process emails in batches to prevent timeouts
 * 4. Queue job details for enrichment with web data
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const EmailCredentials = require('../models/EmailCredentials');
const jobUtils = require('../utils/jobUtils');
const webEnrichmentService = require('./webEnrichmentService_new');
const emailService = require('./emailService');

// Import the email parsing functions from emailService
const parseLinkedInJobApplication = emailService.parseLinkedInJobApplication;
const parseLinkedInStatusEmail = emailService.parseLinkedInStatusEmail;
const parseLinkedInResponseEmail = emailService.parseLinkedInResponseEmail;
const parseGenericApplicationEmail = emailService.parseGenericApplicationEmail;
const parseGenericResponseEmail = emailService.parseGenericResponseEmail;

/**
 * Search emails using a credential ID
 * @param {string} credentialId - Credential ID
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
exports.searchEmails = async (credentialId, options = {}) => {
  // Get IMAP configuration
  const { imapConfig, searchOptions } = await getImapConfig(credentialId, options);

  // Initialize processing statistics for tracking progress
  const processingStats = {
    emailsTotal: 0,
    emailsProcessed: 0,
    foldersTotal: searchOptions.searchFolders.length,
    foldersProcessed: 0,
    enrichmentTotal: 0,
    enrichmentProcessed: 0
  };

  // Search emails with batching to prevent timeouts
  const results = await searchEmailsInBatches(imapConfig, searchOptions, 25, processingStats);

  // Check which items already exist in the database
  const applications = await checkExistingJobs(results.applications);

  // Return the results with processing statistics
  return {
    applications,
    statusUpdates: results.statusUpdates,
    responses: results.responses,
    processingStats,
    stats: {
      total: applications.length,
      new: applications.filter(app => !app.exists).length,
      existing: applications.filter(app => app.exists).length
    }
  };
};

/**
 * Get IMAP configuration and search options from credential ID
 * @param {string} credentialId - Credential ID in database
 * @param {Object} options - Search options
 * @returns {Promise<Object>} IMAP config, search options and credentials
 */
async function getImapConfig(credentialId, options = {}) {
  if (!credentialId) {
    throw new Error('Credential ID is required');
  }

  // Find credentials in the database
  const credentials = await EmailCredentials.findById(credentialId);
  if (!credentials) {
    throw new Error('Email credentials not found');
  }

  // Decrypt the password
  const password = credentials.decryptPassword();
  if (!password) {
    throw new Error('Error decrypting email password');
  }

  // Create IMAP configuration with increased timeouts for reliability
  const imapConfig = {
    user: credentials.email,
    password: password,
    host: credentials.imapHost,
    port: credentials.imapPort,
    tls: credentials.useTLS,
    tlsOptions: { rejectUnauthorized: credentials.rejectUnauthorized },
    connTimeout: 60000, // Increased connection timeout to 60 seconds
    authTimeout: 60000  // Increased authentication timeout to 60 seconds
  };

  // Determine search date
  const { ignorePreviousImport = false, searchTimeframeDays } = options;
  let searchDate = new Date();
  if (!ignorePreviousImport && credentials.lastImport) {
    // If we have a previous import date and we're not ignoring it, search from that date
    searchDate = new Date(credentials.lastImport);
  } else {
    // Otherwise search based on configured timeframe
    const daysToSearch = searchTimeframeDays || credentials.searchTimeframeDays;
    searchDate.setDate(searchDate.getDate() - daysToSearch);
  }

  // Create search options
  const searchOptions = {
    searchTimeframeDays: searchTimeframeDays || credentials.searchTimeframeDays,
    searchFolders: options.searchFolders || credentials.searchFolders,
    searchDate
  };

  return { imapConfig, searchOptions, credentials };
}

// Export the getImapConfig function so it can be used by other modules
exports.getImapConfig = getImapConfig;

/**
 * Search emails in batches to avoid timeouts
 * @param {Object} imapConfig - IMAP configuration
 * @param {Object} options - Search options
 * @param {number} batchSize - Maximum number of emails to process per batch
 * @param {Object} processingStats - Object to track processing statistics
 * @returns {Promise<Object>} Search results
 */
async function searchEmailsInBatches(imapConfig, options, batchSize = 25, processingStats) {
  return new Promise((resolve, reject) => {
    const {
      searchTimeframeDays = 90,
      searchFolders = ['INBOX'],
      searchDate
    } = options;

    // Use provided search date or calculate based on timeframe
    const since = searchDate || new Date();
    if (!searchDate) {
      since.setDate(since.getDate() - searchTimeframeDays);
    }

    const applications = [];
    const statusUpdates = [];
    const responses = [];

    // Create IMAP connection
    const imap = new Imap(imapConfig);

    imap.once('error', err => {
      reject(new Error(`IMAP connection error: ${err.message}`));
    });

    imap.once('ready', () => {
      // Process each folder sequentially
      processNextFolder(0);
    });

    // Start IMAP connection
    imap.connect();

    // Function to process folders one by one
    function processNextFolder(index) {
      if (index >= searchFolders.length) {
        // All folders processed, return results
        imap.end();
        resolve({ applications, statusUpdates, responses });
        return;
      }

      const folder = searchFolders[index];
      console.log(`Processing folder: ${folder}`);

      // Update processing stats for folder progress
      if (processingStats) {
        processingStats.foldersProcessed = index;
      }

      imap.openBox(folder, true, (err, box) => {
        if (err) {
          console.error(`Error opening folder ${folder}:`, err);
          // Skip to next folder
          processNextFolder(index + 1);
          return;
        }

        // Build search criteria
        const searchCriteria = buildSearchCriteria(since);

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.error(`Error searching in folder ${folder}:`, err);
            processNextFolder(index + 1);
            return;
          }

          if (!results || results.length === 0) {
            // No results in this folder, move to next
            processNextFolder(index + 1);
            return;
          }

          console.log(`Found ${results.length} matching emails in ${folder}`);

          // Update processing stats for email counts
          if (processingStats) {
            processingStats.emailsTotal += results.length;
          }

          // Process emails in batches
          processBatches(results, 0);
        });

        // Process results in batches to avoid timeouts
        function processBatches(allResults, startIndex) {
          if (startIndex >= allResults.length) {
            // All batches processed, move to next folder
            processNextFolder(index + 1);
            return;
          }

          // Get the current batch of results
          const endIndex = Math.min(startIndex + batchSize, allResults.length);
          const currentBatch = allResults.slice(startIndex, endIndex);

          console.log(`Processing batch ${Math.floor(startIndex/batchSize) + 1}: emails ${startIndex+1}-${endIndex} of ${allResults.length}`);

          // Fetch this batch of emails
          const fetch = imap.fetch(currentBatch, { bodies: '' });
          let processedEmails = 0;

          fetch.on('message', (msg, seqno) => {
            msg.on('body', stream => {
              simpleParser(stream, async (err, email) => {
                if (err) {
                  console.error(`Error parsing email:`, err);
                } else {
                  try {
                    // Process the email to extract job-related data
                    await processEmail(email, applications, statusUpdates, responses);
                  } catch (error) {
                    console.error('Error processing email:', error);
                  }
                }

                processedEmails++;

                // Update processing stats for processed emails
                if (processingStats) {
                  processingStats.emailsProcessed++;
                }

                if (processedEmails === currentBatch.length) {
                  // Current batch is complete, process the next batch
                  processBatches(allResults, endIndex);
                }
              });
            });
          });

          fetch.once('error', err => {
            console.error(`Error fetching batch of emails:`, err);
            // Even if there's an error, try to move on to the next batch
            processBatches(allResults, endIndex);
          });

          fetch.once('end', () => {
            // If we didn't process any emails, move to next batch
            if (processedEmails === 0) {
              processBatches(allResults, endIndex);
            }
          });
        }
      });
    }
  });
}

/**
 * Build the search criteria for email queries
 * @param {Date} since - Date to search from
 * @returns {Array} IMAP search criteria
 */
function buildSearchCriteria(since) {
  // Create a chain of OR conditions for FROM criteria
  let fromCriteria = ['FROM', 'jobs-noreply@linkedin.com'];

  const fromOptions = [
    'careers@',
    'talent@',
    'recruiting@',
    'hr@',
    'no-reply@hire.lever.co',
    'notification@',
    '@greenhouse.io',
    'do_not_reply@clearcompany.com',
    'donotreply@',
    'no-reply@',
    'noreply@',
    'applications@',
    'recruitment@',
    'talent-acquisition@'
  ];

  // Chain OR conditions for FROM
  for (const fromOption of fromOptions) {
    fromCriteria = ['OR', fromCriteria, ['FROM', fromOption]];
  }

  // Create a chain of OR conditions for SUBJECT criteria
  let subjectCriteria = ['SUBJECT', 'application'];

  const subjectOptions = [
    'Application',
    'applied',
    'Applied',
    'job',
    'Job',
    'position',
    'Position',
    'career',
    'Career',
    'thank you',
    'Thank you',
    'received',
    'Received',
    'viewed',
    'Viewed',
    'interview',
    'Interview',
    'status',
    'Status',
    'update',
    'Update'
  ];

  // Chain OR conditions for SUBJECT
  for (const subjectOption of subjectOptions) {
    subjectCriteria = ['OR', subjectCriteria, ['SUBJECT', subjectOption]];
  }

  // Combine all criteria
  return [
    ['OR', fromCriteria, subjectCriteria],
    ['SINCE', since]
  ];
}

/**
 * Process a single email to identify job applications, status updates, or responses
 * @param {Object} email - The parsed email object
 * @param {Array} applications - Array to collect application data
 * @param {Array} statusUpdates - Array to collect status update data
 * @param {Array} responses - Array to collect response data
 */
async function processEmail(email, applications, statusUpdates, responses) {
  // Get email metadata
  const subject = email.subject || '';
  const fromAddress = email.from ? email.from.text || '' : '';
  const textContent = email.text || '';
  const htmlContent = email.html || '';

  // 1. LinkedIn emails
  if (fromAddress.includes('jobs-noreply@linkedin.com') ||
      fromAddress.includes('@linkedin.com')) {
    // LinkedIn job application confirmation
    if (subject.includes('application was sent')) {
      const jobData = await parseLinkedInJobApplication(email);
      if (jobData) {
        applications.push(jobData);
      }
    }
    // LinkedIn status update emails
    else if (subject.includes('was viewed by') ||
            subject.includes('is in review') ||
            subject.includes('is being considered') ||
            subject.includes('application status')) {
      const statusUpdate = await parseLinkedInStatusEmail(email);
      if (statusUpdate) {
        statusUpdates.push(statusUpdate);
      }
    }
    // LinkedIn response emails
    else if (subject.includes('your application to') ||
            subject.includes('Your application to') ||
            subject.includes('update on your application') ||
            subject.includes('Update on your application') ||
            subject.includes('your update from') ||
            subject.includes('Your update from') ||
            subject.includes('response to your application') ||
            subject.includes('Response to your application')) {
      const response = await parseLinkedInResponseEmail(email);
      if (response) {
        responses.push(response);
      }
    }
  }
  // 2. General application confirmation emails (non-LinkedIn)
  else if (subject.match(/application received|application (is )?complete|received your application|thank you for (your )?appl(y|ication|ying)|we have received your application|we received your application/i)) {
    const jobData = await parseGenericApplicationEmail(email);
    if (jobData) {
      applications.push(jobData);
    }
  }
  // 3. General rejection/response emails (non-LinkedIn)
  else if (subject.match(/update|status|thank you for your interest|unfortunately|not moving forward|decision/i) &&
           (textContent.match(/unfortunately|not (a )?match|not moving forward|other candidates|regret to inform|thank you for your interest/i) ||
            htmlContent.match(/unfortunately|not (a )?match|not moving forward|other candidates|regret to inform|thank you for your interest/i))) {
    const response = await parseGenericResponseEmail(email, 'Rejected');
    if (response) {
      responses.push(response);
    }
  }
}

/**
 * Check which jobs already exist in the database
 * @param {Array} jobs - Job data to check
 * @returns {Promise<Array>} Jobs with existence information added
 */
async function checkExistingJobs(jobs) {
  const result = [];

  for (const job of jobs) {
    // Check if job already exists in database
    let exists = false;
    let existingJobId = null;

    // Check by external job ID
    if (job.externalJobId) {
      const existingJob = await Job.findOne({ externalJobId: job.externalJobId });
      if (existingJob) {
        exists = true;
        existingJobId = existingJob._id;
      }
    }

    // Check by company and job title if not found by ID
    if (!exists && job.company && job.jobTitle) {
      const existingJob = await Job.findOne({
        company: job.company,
        jobTitle: job.jobTitle
      });
      if (existingJob) {
        exists = true;
        existingJobId = existingJob._id;
      }
    }

    // Add existence status to job object
    result.push({
      ...job,
      exists,
      existingJobId
    });
  }

  return result;
}

/**
 * Process all item types from emails (applications, statusUpdates, responses)
 * @param {Array} applications - Job application data from emails
 * @param {Array} statusUpdates - Status update data from emails
 * @param {Array} responses - Job response data from emails
 * @returns {Promise<Object>} Processing statistics
 */
exports.processAllItems = async (applications = [], statusUpdates = [], responses = []) => {
  const stats = {
    applications: { added: 0, existing: 0, errors: 0 },
    statusUpdates: { processed: 0, errors: 0 },
    responses: { processed: 0, errors: 0 },
    enrichments: { queued: 0, processed: 0, errors: 0 }
  };

  // Process applications
  for (const application of applications) {
    try {
      // Skip items that already exist
      if (application.exists) {
        stats.applications.existing++;
        continue;
      }

      console.log(`Processing application for ${application.jobTitle} at ${application.company}`);

      // Queue job for enrichment if it has a website URL
      if (application.website) {
        await webEnrichmentService.queueJobForEnrichment(application.website, application);
        stats.enrichments.queued++;
      }

      // Save the job to database with basic info (will be updated by enrichment worker later)
      const newJob = new Job({
        source: application.source || 'Email',
        applicationThrough: application.applicationThrough || 'Email',
        company: application.company,
        companyLocation: application.companyLocation || '',
        locationType: application.locationType || 'Remote',
        employmentType: application.employmentType || 'Full-time',
        jobTitle: application.jobTitle,
        website: application.website || '',
        applied: application.applied || new Date(),
        responded: null,
        response: 'No Response',
        externalJobId: application.externalJobId || '',
        notes: application.notes || `Imported from email on ${new Date().toLocaleDateString()}`
      });

      await newJob.save();
      stats.applications.added++;

      // Store the job ID for enrichment later
      if (application.website) {
        await webEnrichmentService.storeJobIdForEnrichment(application.website, newJob._id);
      }
    } catch (error) {
      console.error('Error importing job application:', error);
      stats.applications.errors++;
    }
  }

  // Process status updates
  for (const statusUpdate of statusUpdates) {
    try {
      console.log(`Processing status update for ${statusUpdate.jobTitle} at ${statusUpdate.company}`);

      // Find the job to update
      const job = await jobUtils.findJob(
        statusUpdate.company,
        statusUpdate.jobTitle,
        statusUpdate.externalJobId
      );

      if (job) {
        // Add status check
        job.statusChecks.push({
          date: new Date(statusUpdate.statusDate),
          notes: statusUpdate.notes || `Your application was ${statusUpdate.statusType} by ${statusUpdate.company}`
        });

        await job.save();
        stats.statusUpdates.processed++;
      }
    } catch (error) {
      console.error('Error processing status update:', error);
      stats.statusUpdates.errors++;
    }
  }

  // Process responses
  for (const response of responses) {
    try {
      console.log(`Processing response for ${response.jobTitle} at ${response.company}`);

      // Find the job to update
      const job = await jobUtils.findJob(
        response.company,
        response.jobTitle,
        response.externalJobId
      );

      if (job) {
        // Only update response if the new status has higher priority
        const shouldUpdate = jobUtils.shouldUpdateJobStatus(job.response, response.response);

        if (shouldUpdate) {
          // Add response info
          job.response = response.response;
          job.responded = new Date(response.responded);
        }

        // Always add a status check entry
        job.statusChecks.push({
          date: new Date(response.responded),
          notes: response.notes || `Received a ${response.response.toLowerCase()} from ${response.company}`
        });

        await job.save();
        stats.responses.processed++;
      }
    } catch (error) {
      console.error('Error processing job response:', error);
      stats.responses.errors++;
    }
  }

  return stats;
};

/**
 * Process items in the background as a worker task to prevent timeouts
 * @param {Object} job - The job data containing items to process
 * @returns {Promise<Object>} Processing statistics
 */
exports.processItemsAsWorker = async (job) => {
  const { applications = [], statusUpdates = [], responses = [] } = job.data;

  try {
    // Process the items
    const stats = await exports.processAllItems(applications, statusUpdates, responses);

    // Start web enrichment processing for any jobs that were queued
    if (stats.enrichments.queued > 0) {
      await webEnrichmentService.processEnrichmentQueue();
    }

    return stats;
  } catch (error) {
    console.error('Error in worker processing job items:', error);
    throw error;
  }
};

// The email parsing functions are imported from the existing implementation
// but are not shown here for brevity. These functions would be:
// parseLinkedInJobApplication, parseLinkedInStatusEmail, parseLinkedInResponseEmail,
// parseGenericApplicationEmail, parseGenericResponseEmail