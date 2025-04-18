const Imap = require('imap');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const EmailCredentials = require('../models/EmailCredentials');
const linkedInService = require('./linkedInEnrichmentService');
const jobUtils = require('../utils/jobUtils');
const linkedInUtils = require('../utils/linkedInUtils');

/**
 * Search emails using a credential ID
 * @param {string} credentialId - Credential ID
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
exports.searchEmails = async (credentialId, options = {}) => {
  // Get IMAP configuration
  const { imapConfig, searchOptions, credentials } = await exports.getImapConfig(credentialId, options);

  // Search emails
  const results = await exports.searchEmailsForJobs(imapConfig, searchOptions);

  // Check which items already exist in the database
  const applications = await exports.checkExistingJobs(results.applications);

  // No need to transform the data here as it should already be properly formatted by the parsers
  return {
    applications,
    statusUpdates: results.statusUpdates,
    responses: results.responses,
    stats: {
      total: applications.length,
      new: applications.filter(app => !app.exists).length,
      existing: applications.filter(app => app.exists).length
    }
  };
};

/**
 * Search emails using a credential ID with a chunked approach to avoid timeouts
 * @param {string} credentialId - Credential ID
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
exports.searchEmailsChunked = async (credentialId, options = {}) => {
  // Get IMAP configuration
  const { imapConfig, searchOptions, credentials } = await exports.getImapConfig(credentialId, options);

  // Maximum number of emails to process in a batch
  const BATCH_SIZE = 25;

  // Initialize results
  let applications = [];
  let statusUpdates = [];
  let responses = [];

  // Initialize processing statistics for progress tracking
  const processingStats = {
    emailsTotal: 0,
    emailsProcessed: 0,
    foldersTotal: searchOptions.searchFolders.length,
    foldersProcessed: 0,
    enrichmentTotal: 0,
    enrichmentProcessed: 0
  };

  // Search emails with batching
  const results = await searchEmailsInBatches(imapConfig, searchOptions, BATCH_SIZE, processingStats);

  // Combine results
  applications = results.applications;
  statusUpdates = results.statusUpdates;
  responses = results.responses;

  // Check which items already exist in the database
  const checkedApplications = await exports.checkExistingJobs(applications);

  // Process LinkedIn enrichment in batches
  const enrichedJobs = await linkedInService.processEnrichmentQueue();

  // Update enrichment statistics for tracking
  processingStats.enrichmentTotal = applications.length;
  processingStats.enrichmentProcessed = enrichedJobs.length;

  // Count pending enrichments
  const pendingEnrichments = linkedInService.getPendingEnrichmentCount();

  // Apply enriched data to the application results
  if (enrichedJobs.length > 0) {
    enrichedJobs.forEach(enriched => {
      const applicationIndex = checkedApplications.findIndex(
        app => app.externalJobId === enriched.externalJobId
      );

      if (applicationIndex !== -1) {
        checkedApplications[applicationIndex] = linkedInService.applyEnrichmentToJob(
          checkedApplications[applicationIndex],
          enriched.enrichedData
        );
      }
    });
  }

  // Return the results with processing statistics
  return {
    applications: checkedApplications,
    statusUpdates,
    responses,
    processingStats,
    pendingEnrichments,
    stats: {
      total: checkedApplications.length,
      new: checkedApplications.filter(app => !app.exists).length,
      existing: checkedApplications.filter(app => app.exists).length
    }
  };
};

/**
 * Get available folders for an email account
 * @param {string} credentialId - Credential ID
 * @returns {Promise<Array>} List of folders
 */
exports.getAvailableFolders = async (credentialId) => {
  const { imapConfig } = await exports.getImapConfig(credentialId);
  return await exports.getEmailFolders(imapConfig);
};

/**
 * Import job items from emails
 * @param {Array} applications - Applications to import
 * @param {Array} statusUpdates - Status updates to process
 * @param {Array} responses - Responses to process
 * @returns {Promise<Object>} Import statistics
 */
exports.importItems = async (applications = [], statusUpdates = [], responses = []) => {
  return await exports.processAllItems(applications, statusUpdates, responses);
};

/**
 * Sync emails - search and import in one operation
 * @param {string} credentialId - Credential ID
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} Sync results
 */
exports.syncEmails = async (credentialId, options = {}) => {
  // Get IMAP configuration
  const { imapConfig, searchOptions, credentials } = await exports.getImapConfig(credentialId, options);

  // Search emails
  const results = await exports.searchEmailsForJobs(imapConfig, searchOptions);

  // Check which applications already exist
  const applications = await exports.checkExistingJobs(results.applications);
  const newApplications = applications.filter(app => !app.exists);

  // No need to transform status updates and responses here -
  // they should already be properly formatted by the parsers
  const { statusUpdates, responses } = results;

  // Process items
  const stats = await exports.processAllItems(
    newApplications,
    statusUpdates,
    responses,
    applications.length - newApplications.length
  );

  // Update last import time
  credentials.lastImport = new Date();
  await credentials.save();

  return {
    stats,
    applications: newApplications,
    statusUpdates,
    responses
  };
};

/**
 * Save email credentials
 * @param {Object} credentialData - Credential data
 * @returns {Promise<Object>} Saved credentials (without password)
 */
exports.saveCredentials = async (credentialData) => {
  const {
    email,
    password,
    imapHost,
    imapPort,
    useTLS = true,
    rejectUnauthorized = true,
    searchTimeframeDays = 90,
    searchFolders = ['INBOX']
  } = credentialData;

  // Validate required fields
  if (!email || !imapHost || !imapPort) {
    throw new Error('Email, IMAP host, and port are required');
  }

  // Check if credentials already exist
  let credentials = await EmailCredentials.findOne({ email });

  if (credentials) {
    // Update existing credentials
    if (password) {
      credentials.password = password;
    }
    credentials.imapHost = imapHost;
    credentials.imapPort = imapPort;
    credentials.useTLS = useTLS;
    credentials.rejectUnauthorized = rejectUnauthorized;
    credentials.searchTimeframeDays = searchTimeframeDays;
    credentials.searchFolders = searchFolders;
  } else {
    // Create new credentials
    if (!password) {
      throw new Error('Password is required for new credentials');
    }
    credentials = new EmailCredentials({
      email,
      password,
      imapHost,
      imapPort,
      useTLS,
      rejectUnauthorized,
      searchTimeframeDays,
      searchFolders
    });
  }

  await credentials.save();

  // Return safe version without password
  const safeCredentials = credentials.toObject();
  delete safeCredentials.password;
  return safeCredentials;
};

/**
 * Get all email credentials
 * @returns {Promise<Array>} List of credentials without passwords
 */
exports.getAllCredentials = async () => {
  const credentials = await EmailCredentials.find({});
  return credentials.map(cred => {
    const obj = cred.toObject();
    delete obj.password;
    return obj;
  });
};

/**
 * Delete email credentials
 * @param {string} id - Credential ID
 * @returns {Promise<boolean>} Success status
 */
exports.deleteCredentials = async (id) => {
  const result = await EmailCredentials.findByIdAndDelete(id);
  if (!result) {
    throw new Error('Email credentials not found');
  }
  return true;
};

/**
 * Get IMAP configuration and search options from credential ID
 * @param {string} credentialId - Credential ID in database
 * @param {Object} options - Search options
 * @returns {Promise<Object>} IMAP config, search options and credentials
 */
exports.getImapConfig = async (credentialId, options = {}) => {
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

  // Create IMAP configuration
  const imapConfig = {
    user: credentials.email,
    password: password,
    host: credentials.imapHost,
    port: credentials.imapPort,
    tls: credentials.useTLS,
    tlsOptions: { rejectUnauthorized: credentials.rejectUnauthorized }
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
};

/**
 * Search emails for job applications and status updates
 * @param {Object} imapConfig - IMAP configuration object
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with applications, status updates, and responses
 */
exports.searchEmailsForJobs = async (imapConfig, options) => {
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
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          console.error(`Error opening folder ${folder}:`, err);
          // Skip to next folder
          processNextFolder(index + 1);
          return;
        }

        // Search for all job-related emails using multiple senders and broader criteria
        // IMAP OR operator can only take exactly 2 arguments, so we need to nest them
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
        const searchCriteria = [
          ['OR', fromCriteria, subjectCriteria],
          ['SINCE', since]
        ];

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

          // Fetch emails
          const fetch = imap.fetch(results, { bodies: '' });
          let processedEmails = 0;

          fetch.on('message', (msg, seqno) => {
            msg.on('body', stream => {
              simpleParser(stream, async (err, email) => {
                if (err) {
                  console.error(`Error parsing email:`, err);
                } else {
                  try {
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
                  } catch (error) {
                    console.error('Error processing email:', error);
                  }
                }

                processedEmails++;
                if (processedEmails === results.length) {
                  // All emails in this folder processed, move to next folder
                  processNextFolder(index + 1);
                }
              });
            });
          });

          fetch.once('error', err => {
            console.error(`Error fetching emails from folder ${folder}:`, err);
            processNextFolder(index + 1);
          });

          fetch.once('end', () => {
            // If we didn't process any emails, move to next folder
            if (processedEmails === 0) {
              processNextFolder(index + 1);
            }
          });
        });
      });
    }
  })
  .then(async (results) => {
    // Process the LinkedIn enrichment queue after emails are processed
    const enrichedJobs = await linkedInService.processEnrichmentQueue();

    // Apply enriched data to the application results
    if (enrichedJobs.length > 0) {
      enrichedJobs.forEach(enriched => {
        const applicationIndex = results.applications.findIndex(
          app => app.externalJobId === enriched.externalJobId
        );

        if (applicationIndex !== -1) {
          results.applications[applicationIndex] = linkedInService.applyEnrichmentToJob(
            results.applications[applicationIndex],
            enriched.enrichedData
          );
        }
      });
    }

    return results;
  });
};

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

        // Build search criteria similar to the original function
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
                    // Use the same email processing logic as before
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
  })
  .then(async (results) => {
    // Update enrichment statistics before processing
    if (processingStats) {
      // Count applications that have LinkedIn URLs for enrichment
      const linkedInApplications = results.applications.filter(app =>
        app.website && app.website.includes('linkedin.com/jobs/view')
      );

      processingStats.enrichmentTotal = linkedInApplications.length;
    }

    // Process the LinkedIn enrichment queue after emails are processed
    const enrichedJobs = await linkedInService.processEnrichmentQueue();

    // Update enrichment processed count
    if (processingStats) {
      processingStats.enrichmentProcessed = enrichedJobs.length;
    }

    // Apply enriched data to the application results
    if (enrichedJobs.length > 0) {
      enrichedJobs.forEach(enriched => {
        const applicationIndex = results.applications.findIndex(
          app => app.externalJobId === enriched.externalJobId
        );

        if (applicationIndex !== -1) {
          results.applications[applicationIndex] = linkedInService.applyEnrichmentToJob(
            results.applications[applicationIndex],
            enriched.enrichedData
          );
        }
      });
    }

    return results;
  });
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
 * Get available folders from email account
 * @param {Object} imapConfig - IMAP configuration
 * @returns {Promise<string[]>} List of available email folders
 */
exports.getEmailFolders = (imapConfig) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);

    imap.once('error', err => {
      reject(new Error(`IMAP connection error: ${err.message}`));
    });

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) {
          reject(new Error(`Error getting email folders: ${err.message}`));
          return;
        }

        // Extract folder names recursively
        const folders = [];

        function extractFolders(boxesObj, prefix = '') {
          Object.keys(boxesObj).forEach(key => {
            const fullPath = prefix + key;
            folders.push(fullPath);

            // Process subfolders
            if (boxesObj[key].children) {
              extractFolders(boxesObj[key].children, fullPath + boxesObj[key].delimiter);
            }
          });
        }

        extractFolders(boxes);

        // Always include INBOX if not already present
        if (!folders.includes('INBOX')) {
          folders.unshift('INBOX');
        }

        resolve(folders);
      });
    });

    imap.connect();
  });
};

/**
 * Process all item types from emails (applications, statusUpdates, responses)
 * @param {Array} applications - Job application data from emails
 * @param {Array} statusUpdates - Status update data from emails
 * @param {Array} responses - Job response data from emails
 * @param {number} existingCount - Count of existing jobs that aren't being imported
 * @returns {Promise<Object>} Processing statistics
 */
exports.processAllItems = async (applications = [], statusUpdates = [], responses = [], existingCount = 0) => {
  const stats = {
    applications: { added: 0, existing: existingCount, errors: 0 },
    statusUpdates: { processed: 0, errors: 0 },
    responses: { processed: 0, errors: 0 }
  };

  // 1. Process job applications (create new jobs)
  for (const application of applications) {
    try {
      // Skip items that already exist
      if (application.exists) continue;

      // Create new job
      const newJob = new Job({
        source: application.source || 'LinkedIn',
        applicationThrough: application.applicationThrough || 'LinkedIn',
        company: application.company,
        companyLocation: application.companyLocation,
        locationType: application.locationType || 'Remote',
        employmentType: application.employmentType || 'Full-time',
        jobTitle: application.jobTitle,
        wagesMin: application.wagesMin || null,
        wagesMax: application.wagesMax || null,
        wageType: application.wageType || 'Yearly',
        applied: application.applied || new Date(),
        responded: null,
        response: 'No Response',
        website: application.website || application.jobUrl || '',
        description: application.description || '',
        externalJobId: application.externalJobId || '',
        notes: application.notes || `Imported from email on ${new Date().toLocaleDateString()}`
      });

      await newJob.save();
      stats.applications.added++;
    } catch (error) {
      console.error('Error importing job application:', error);
      stats.applications.errors++;
    }
  }

  // 2. Process status updates (update existing jobs)
  for (const statusUpdate of statusUpdates) {
    try {
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

  // 3. Process responses (update existing jobs with response status)
  for (const response of responses) {
    try {
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
          // Add response info - use the response field directly from the parsed email
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
 * Check which jobs already exist in the database
 * @param {Array} jobs - Job data to check
 * @returns {Promise<Array>} Jobs with existence information added
 */
exports.checkExistingJobs = async (jobs) => {
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
};

/**
 * Parse LinkedIn job application confirmation email
 * @param {Object} email - Email object with subject, html, and date properties
 * @returns {Promise<Object|null>} Parsed job data or null if invalid
 */
async function parseLinkedInJobApplication(email) {
  try {
    // Check subject format: "Name, your application was sent to Company"
    const companyMatch = email.subject.match(/application was sent to (.+)$/i);
    if (!companyMatch || !companyMatch[1]) {
      console.log('Could not extract company name from subject:', email.subject);
      return null;
    }

    const company = companyMatch[1].trim();

    // Extract date from email headers - directly use as applied date
    const emailDate = new Date(email.date);

    // Use cheerio to parse HTML content
    const $ = cheerio.load(email.html);

    // Console log for debugging
    console.log('=== PARSING LINKEDIN JOB APPLICATION ===');
    console.log('Subject:', email.subject);
    console.log('Company:', company);
    console.log('Date:', emailDate);

    // Extract job title - multiple improved strategies
    let jobTitle = '';

    // Strategy 0: Try to extract from subject line if it contains the job title
    // Example: "John, your application was sent to Software Engineer at Company"
    const subjectJobMatch = email.subject.match(/application was sent to (.+?) at (.+)$/i);
    if (subjectJobMatch && subjectJobMatch[1]) {
      jobTitle = subjectJobMatch[1].trim();
      console.log('Job title from subject:', jobTitle);
    }

    // Strategy 1: Look for job title in links to job postings
    if (!jobTitle) {
      $('a[href*="/jobs/view/"]').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 3 && !jobTitle) {
          jobTitle = text;
          console.log('Job title from job links:', jobTitle);
        }
      });
    }

    // Strategy 2: Look for job title in specific LinkedIn elements (common in their emails)
    if (!jobTitle) {
      $('.job-title, .job-position, .position-title, .role-title').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 3 && text.length < 100) {
          jobTitle = text;
          console.log('Job title from LinkedIn elements:', jobTitle);
        }
      });
    }

    // Strategy 3: Look for job title in heading elements with improved filtering
    if (!jobTitle) {
      $('h1, h2, h3').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 5 && text.length < 100 && !text.includes('LinkedIn') && !text.includes('Application')) {
          jobTitle = text;
          console.log('Job title from headings:', jobTitle);
        }
      });
    }

    // Strategy 4: Look for paragraphs that might contain the job title
    if (!jobTitle) {
      $('p, div, span').each((i, el) => {
        const text = $(el).text().trim();
        // Look for paragraphs containing "position", "role", or "job" keywords
        if (text && text.length > 5 && text.length < 200 &&
            (text.includes('position') || text.includes('role') || text.includes('job'))) {
          // Extract sentence with job information
          const sentences = text.split(/[.!?]+/);
          for (const sentence of sentences) {
            if (sentence.includes('position') || sentence.includes('role') || sentence.includes('job')) {
              // Clean up the sentence to try to isolate job title
              const cleanedSentence = sentence.trim()
                .replace(/applied for/i, '')
                .replace(/the position of/i, '')
                .replace(/the role of/i, '')
                .replace(/position:/i, '')
                .replace(/role:/i, '')
                .replace(/job:/i, '')
                .trim();

              if (cleanedSentence && cleanedSentence.length > 3 && cleanedSentence.length < 100) {
                jobTitle = cleanedSentence;
                console.log('Job title from paragraph text:', jobTitle);
                break;
              }
            }
          }
        }
      });
    }

    // Strategy 5: Look for strong or emphasized text that might be job titles
    if (!jobTitle) {
      $('strong, b, em').each((i, el) => {
        const text = $(el).text().trim();
        // Skip very short texts or known non-title text
        if (text && text.length > 5 && text.length < 100 &&
            !text.includes('LinkedIn') && !text.includes('http')) {
          jobTitle = text;
          console.log('Job title from emphasized text:', jobTitle);
          return false; // break the loop
        }
      });
    }

    // Clean up the job title if it exists
    if (jobTitle) {
      // Remove company name from job title if present (common in LinkedIn emails)
      if (jobTitle.includes(company)) {
        jobTitle = jobTitle.replace(new RegExp(`\\s*${company}.*$`, 'i'), '');
      }

      // Fix the specific pattern we're seeing:
      // "Job Title       Company · Location" format
      if (jobTitle.includes('       ')) {
        jobTitle = jobTitle.split('       ')[0].trim();
      }

      // Remove location information patterns
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

    // Extract location information with better parsing
    let companyLocation = '';
    let locationType = 'Remote'; // Default

    // Look for location in paragraphs containing a dot separator
    $('p:contains("·")').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.includes('·')) {
        const parts = text.split('·');
        if (parts.length >= 2) {
          companyLocation = parts[1].trim();

          // Determine location type based on keyword analysis
          const locationLower = companyLocation.toLowerCase();
          if (locationLower.includes('remote')) {
            locationType = 'Remote';
          } else if (locationLower.includes('hybrid')) {
            locationType = 'Hybrid';
          } else {
            locationType = 'On-site';
          }
        }
      }
    });

    // If no location found with dot separator, try other patterns
    if (!companyLocation) {
      // Try to find location information in spans or divs
      $('span, div').each((i, el) => {
        const text = $(el).text().trim();
        if (text && (text.includes('Location:') ||
                     text.includes('Located in') ||
                     text.includes(', CA') ||
                     text.includes(', NY') ||
                     text.includes('Remote'))) {
          companyLocation = text;

          // Determine location type
          const locationLower = text.toLowerCase();
          if (locationLower.includes('remote')) {
            locationType = 'Remote';
          } else if (locationLower.includes('hybrid')) {
            locationType = 'Hybrid';
          } else {
            locationType = 'On-site';
          }
          return false; // break the loop
        }
      });
    }

    // Extract employment type (full-time, part-time, contract)
    let employmentType = 'Full-time'; // Default

    $('span, div, p').each((i, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes('full-time')) {
        employmentType = 'Full-time';
        return false;
      } else if (text.includes('part-time')) {
        employmentType = 'Part-time';
        return false;
      } else if (text.includes('contract') || text.includes('temporary')) {
        employmentType = 'Contract';
        return false;
      } else if (text.includes('internship')) {
        employmentType = 'Internship';
        return false;
      }
    });

    // Extract job URL
    let website = '';
    $('a[href*="/jobs/view/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !website) {
        website = href;
      }
    });

    // Extract job ID from URL
    let externalJobId = '';
    if (website) {
      externalJobId = linkedInUtils.extractJobIdFromUrl(website) || '';
    }

    // Extract salary information if available
    let wagesMin = null;
    let wagesMax = null;
    let wageType = 'Yearly';

    $('span, div, p').each((i, el) => {
      const text = $(el).text().trim();

      // Look for salary information patterns
      if (text.includes('$') ||
          text.toLowerCase().includes('salary') ||
          text.toLowerCase().includes('compensation')) {

        // Try to extract salary range with regex
        const salaryMatch = text.match(/\$([0-9,]+)(?:\s*-\s*\$?([0-9,]+))?/);
        if (salaryMatch) {
          // Remove commas and convert to number
          wagesMin = parseInt(salaryMatch[1].replace(/,/g, ''), 10);

          if (salaryMatch[2]) {
            wagesMax = parseInt(salaryMatch[2].replace(/,/g, ''), 10);
          } else {
            wagesMax = wagesMin;
          }

          // Determine wage type
          const lowercaseText = text.toLowerCase();
          if (lowercaseText.includes('hour') || lowercaseText.includes('/hr')) {
            wageType = 'Hourly';
          } else if (lowercaseText.includes('month')) {
            wageType = 'Monthly';
          } else if (lowercaseText.includes('week')) {
            wageType = 'Weekly';
          } else {
            wageType = 'Yearly'; // Default
          }

          return false; // break the loop
        }
      }
    });

    // Create job data object - using field names that match the Job model
    const jobData = {
      jobTitle: jobTitle || `Position at ${company}`,
      company,
      companyLocation,
      locationType,
      employmentType,
      website,
      externalJobId,
      wagesMin,
      wagesMax,
      wageType,
      source: 'LinkedIn',
      applied: emailDate,
      applicationThrough: 'LinkedIn',
      response: 'No Response',
      notes: `Applied via LinkedIn on ${emailDate.toLocaleDateString()}`,
      itemType: 'application'
    };

    // Log the final job data
    console.log('Final job title extracted:', jobData.jobTitle);
    console.log('Job data:', JSON.stringify(jobData));

    // Queue the URL for enrichment if available
    if (website) {
      linkedInService.queueJobForEnrichment(website, jobData);
    }

    return jobData;
  } catch (error) {
    console.error('Error parsing LinkedIn job application email:', error);
    return null;
  }
}

/**
 * Parses LinkedIn status update emails (e.g., "Your application was viewed by")
 * @param {Object} email - The parsed email object from simpleParser
 * @returns {Object|null} Parsed status update data or null if parsing fails
 */
async function parseLinkedInStatusEmail(email) {
  try {
    // Extract company name from the subject
    // Example: "Your application was viewed by Mi-Case"
    const subject = email.subject || '';

    // Determine the status type based on email subject
    let statusType = "";
    let company = "";

    // Try to extract company and status type from subject patterns
    const viewedMatch = subject.match(/was viewed by (.+)$/i);
    const inReviewMatch = subject.match(/is in review at (.+)$/i);
    const consideringMatch = subject.match(/is being considered at (.+)$/i);

    if (viewedMatch && viewedMatch[1]) {
      statusType = "viewed";
      company = viewedMatch[1].trim();
    } else if (inReviewMatch && inReviewMatch[1]) {
      statusType = "in review";
      company = inReviewMatch[1].trim();
    } else if (consideringMatch && consideringMatch[1]) {
      statusType = "being considered";
      company = consideringMatch[1].trim();
    } else {
      console.log('Could not determine status type from subject:', subject);
      return null;
    }

    // Extract date from email headers
    const emailDate = new Date(email.date);

    // Initialize cheerio with the email HTML content
    const $ = cheerio.load(email.html);

    // Extract job title - multiple strategies
    let jobTitle = '';

    // Strategy 1: Look for links to job postings
    $('a[href*="/jobs/view/"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 3 && !jobTitle) {
        jobTitle = text;
      }
    });

    // Strategy 2: Look for job title in heading elements
    if (!jobTitle) {
      $('h1, h2, h3').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 5 && text.length < 100 && !jobTitle) {
          jobTitle = text;
        }
      });
    }

    // Strategy 3: Look for paragraphs with job-like text
    if (!jobTitle) {
      $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 5 && text.length < 100) {
          // This might be a job title
          jobTitle = text;
          return false; // break the loop
        }
      });
    }

    // Extract job URL and ID
    let website = '';
    $('a[href*="/jobs/view/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !website) {
        website = href;
      }
    });

    // Extract job ID from URL
    let externalJobId = '';
    if (website) {
      externalJobId = linkedInUtils.extractJobIdFromUrl(website) || '';
    }

    // Prepare notes field with detailed information
    const notes = `Your application for ${jobTitle || 'this position'} was ${statusType} by ${company} on ${emailDate.toLocaleDateString()}`;

    // Format with fields that match the Job model where appropriate
    return {
      company,
      jobTitle: jobTitle || `Position at ${company}`,
      statusDate: emailDate,
      statusType,
      externalJobId,
      website,
      notes,
      itemType: 'statusUpdate'
    };
  } catch (error) {
    console.error('Error parsing LinkedIn status email:', error);
    return null;
  }
}

/**
 * Parses LinkedIn response emails (e.g., "Your application to...")
 * @param {Object} email - The parsed email object from simpleParser
 * @returns {Object|null} Parsed response data or null if parsing fails
 */
async function parseLinkedInResponseEmail(email) {
  try {
    // Variable for storing the company and job title
    let jobTitle = '';
    let company = '';

    // Get the subject line
    const subject = email.subject || '';

    // Different patterns for LinkedIn response emails
    // Pattern 1: "Your application to [Position] at [Company]"
    const applicationToMatch = subject.match(/application to (.+) at (.+)$/i);

    // Pattern 2: "Update on your application to [Company]"
    const updateOnMatch = subject.match(/update on your application to (.+)$/i);

    // Pattern 3: "Your update from [Company]"
    const updateFromMatch = subject.match(/your update from (.+)$/i);

    if (applicationToMatch && applicationToMatch.length >= 3) {
      jobTitle = applicationToMatch[1].trim();
      company = applicationToMatch[2].trim();
    } else if (updateOnMatch && updateOnMatch.length >= 2) {
      company = updateOnMatch[1].trim();
    } else if (updateFromMatch && updateFromMatch.length >= 2) {
      company = updateFromMatch[1].trim();
    } else {
      console.log('Could not extract job details from subject:', subject);
      return null;
    }

    // Extract date from email headers
    const emailDate = new Date(email.date);

    // Use cheerio to parse HTML content
    const $ = cheerio.load(email.html);

    // If job title wasn't in the subject, try to find it in the email content
    if (!jobTitle) {
      // Try to find job title in the email body
      $('a[href*="/jobs/view/"]').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 3 && !jobTitle) {
          jobTitle = text;
        }
      });

      // Try alternative sources if we still don't have a job title
      if (!jobTitle) {
        // Try looking for it in paragraph text near "position" or "role" keywords
        $('p, div, span').each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.includes('position') || text.includes('role')) {
            // This paragraph might contain the job title
            const sentences = text.split(/[.!?]+/);
            for (const sentence of sentences) {
              if (sentence.includes('position') || sentence.includes('role')) {
                // Extract potential job title - basic approach
                jobTitle = sentence.trim();
                break;
              }
            }
            if (jobTitle) return false; // break the loop
          }
        });
      }
    }

    // Default to generic title if we still couldn't find one
    if (!jobTitle) {
      jobTitle = `Position at ${company}`;
    }

    // Extract response type and map directly to Job model's response field values
    let response = 'No Response';
    let responseDescription = "response";

    // Search for rejection language in the HTML content
    const textContent = email.html || '';

    // Check for rejection keywords
    if (textContent.includes('not moving forward') ||
        textContent.includes('not be moving forward') ||
        textContent.includes('Unfortunately') ||
        textContent.includes('other candidates') ||
        textContent.includes('pursuing other') ||
        textContent.includes('will not be') ||
        textContent.includes('thank you for your interest') ||
        textContent.includes('regret to inform')) {

      response = 'Rejected';
      responseDescription = "rejection";
    }
    // Check for interview request keywords
    else if (textContent.includes('interview') ||
             textContent.includes('schedule a call') ||
             textContent.includes('would like to speak') ||
             textContent.includes('next steps') ||
             textContent.includes('move forward')) {

      response = 'Interview';
      responseDescription = "interview request";
    }
    // Check for offer keywords
    else if (textContent.includes('offer') ||
             textContent.includes('congratulations') ||
             textContent.includes('welcome to the team')) {

      response = 'Offer';
      responseDescription = "job offer";
    }

    // Extract job URL
    let website = '';
    $('a[href*="/jobs/view/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && !website) {
          website = href;
        }
    });

    // Extract job ID from URL
    let externalJobId = '';
    if (website) {
        externalJobId = linkedInUtils.extractJobIdFromUrl(website) || '';
    }

    // Prepare notes field with more detailed information
    const notes = `Received a ${responseDescription} from ${company} for ${jobTitle} position on ${emailDate.toLocaleDateString()}`;

    // Format with fields that match the Job model where appropriate
    return {
      company,
      jobTitle,
      response,          // DIRECTLY mapped to Job model's response field
      externalJobId,
      website,           // Match Job model field name
      notes,
      responded: emailDate,  // When the company responded - directly matches Job model field
      itemType: 'response'   // Kept for processing identification
    };
  } catch (error) {
    console.error('Error parsing LinkedIn response email:', error);
    return null;
  }
}

/**
 * Parse generic (non-LinkedIn) job application confirmation emails
 * @param {Object} email - Email object with subject, html, text and date properties
 * @returns {Promise<Object|null>} Parsed job data or null if invalid
 */
async function parseGenericApplicationEmail(email) {
  try {
    // Get email metadata
    const subject = email.subject || '';
    const fromAddress = email.from ? email.from.text || '' : '';
    const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1].split('>')[0] : '';
    const emailDate = new Date(email.date);
    const textContent = email.text || '';
    const htmlContent = email.html || '';

    // Initialize cheerio with the email HTML content if available
    const $ = htmlContent ? cheerio.load(htmlContent) : null;

    // Extract company name - multiple strategies
    let company = '';

    // Strategy 1: Try to extract from the from address domain
    if (fromDomain) {
      // Remove common email providers and extract company name
      if (!fromDomain.match(/gmail|hotmail|outlook|yahoo|aol|icloud|protonmail/i)) {
        const domainParts = fromDomain.split('.');
        if (domainParts.length >= 2) {
          company = domainParts[domainParts.length - 2].charAt(0).toUpperCase() +
                   domainParts[domainParts.length - 2].slice(1);
        }
      }
    }

    // Strategy 2: Try to extract from the email address display name
    if (!company && fromAddress) {
      const fromNameMatch = fromAddress.match(/^"?([^"<]+)"?\s*</);
      if (fromNameMatch && fromNameMatch[1]) {
        // Check if the display name contains terms like "HR", "Recruiting", etc.
        const displayName = fromNameMatch[1].trim();
        if (!displayName.match(/^(HR|Recruiting|Talent|Careers|Jobs|Applications|Human Resources|Notifications|No Reply|DoNotReply|Careers Portal)$/i)) {
          // If it's not just a generic department name, it might be the company
          company = displayName;
        }
      }
    }

    // Strategy 3: Try to extract from the subject
    if (!company) {
      const subjectCompanyMatches = subject.match(/from (.+)|at (.+)|to (.+)|for (.+)/i);
      if (subjectCompanyMatches) {
        for (let i = 1; i < subjectCompanyMatches.length; i++) {
          if (subjectCompanyMatches[i]) {
            company = subjectCompanyMatches[i].trim();
            break;
          }
        }
      }
    }

    // Strategy 4: Try to extract from the email body if we have cheerio loaded
    if (!company && $) {
      // Look for company name in logo alt text or title attributes
      $('img[alt*="logo"], img[title*="logo"]').each((i, el) => {
        const alt = $(el).attr('alt') || '';
        const title = $(el).attr('title') || '';
        const logoText = alt || title;

        if (logoText && logoText.includes('logo')) {
          const logoCompanyMatch = logoText.match(/(.+?)\s+logo/i);
          if (logoCompanyMatch && logoCompanyMatch[1]) {
            company = logoCompanyMatch[1].trim();
            return false; // break the loop
          }
        }
      });

      // Look for company name in signature blocks or footers
      if (!company) {
        $('div.signature, div.footer, footer, div[class*="footer"], div[class*="signature"]').each((i, el) => {
          const text = $(el).text().trim();
          const lines = text.split('\n');
          if (lines.length && lines[0].length > 2 && lines[0].length < 50) {
            company = lines[0].trim();
            return false;
          }
        });
      }
    }

    // Strategy 5: Check for common patterns in text content
    if (!company) {
      // Look for "Thank you for applying to/at [Company]" pattern
      const thankYouMatch = textContent.match(/thank you for (applying|your application) (to|at|with) ([^,.]+)/i) ||
                           htmlContent.match(/thank you for (applying|your application) (to|at|with) ([^,.]+)/i);

      if (thankYouMatch && thankYouMatch[3]) {
        company = thankYouMatch[3].trim();
      }
    }

    // If all else fails, try to make an educated guess from the email domain
    if (!company && fromDomain) {
      company = fromDomain.split('.')[0];
      // Capitalize first letter
      if (company) {
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    }

    // Extract job title - multiple strategies
    let jobTitle = '';

    // Strategy 1: Check subject line for job title
    const roleMatches = subject.match(/for (.+?) role|for (.+?) position|for (?:the )?(.+)|(.+?) application/i);
    if (roleMatches) {
      for (let i = 1; i < roleMatches.length; i++) {
        if (roleMatches[i]) {
          jobTitle = roleMatches[i].trim();
          // Clean up common phrases that aren't part of the job title
          jobTitle = jobTitle.replace(/^(the|your|a|an) /i, '')
                           .replace(/ position$| role$| job$| opening$| application$| received$| complete$/i, '');
          break;
        }
      }
    }

    // Strategy 2: Look for job title in HTML content if available
    if (!jobTitle && $) {
      // Look for job title in common patterns
      $('p, div, span, h1, h2, h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();

        // Pattern: "Position: [Job Title]" or "Role: [Job Title]"
        const positionLabelMatch = text.match(/position[:\s]+([^,.]+)/i) || text.match(/role[:\s]+([^,.]+)/i);
        if (positionLabelMatch && positionLabelMatch[1]) {
          jobTitle = positionLabelMatch[1].trim();
          return false; // break the loop
        }

        // Pattern: "applied for the [Job Title] position"
        const appliedForMatch = text.match(/applied for (?:the )?([^,.]+?) (?:position|role|job)/i);
        if (appliedForMatch && appliedForMatch[1]) {
          jobTitle = appliedForMatch[1].trim();
          return false;
        }
      });
    }

    // Strategy 3: Check for patterns in plain text
    if (!jobTitle) {
      // Look for position/role keywords
      const positionMatch = textContent.match(/position[:\s]+([^,.]+)/i) ||
                          textContent.match(/role[:\s]+([^,.]+)/i) ||
                          textContent.match(/applied for (?:the )?([^,.]+?) (?:position|role|job)/i);

      if (positionMatch && positionMatch[1]) {
        jobTitle = positionMatch[1].trim();
      }
    }

    // Use a default job title if we couldn't extract one
    if (!jobTitle && company) {
      jobTitle = `Position at ${company}`;
    }

    // Extract location and employment type if possible
    let companyLocation = '';
    let locationType = 'Remote'; // Default
    let employmentType = 'Full-time'; // Default

    // Create job data object with the extracted information
    const jobData = {
      jobTitle: jobTitle || 'Unknown Position',
      company: company || 'Unknown Company',
      companyLocation,
      locationType,
      employmentType,
      website: '',
      applied: emailDate,
      applicationThrough: 'Email',
      response: 'No Response',
      source: fromDomain || 'Email',
      notes: `Application confirmation received via email on ${emailDate.toLocaleDateString()}`,
      itemType: 'application',
      emailId: email.messageId // Store message ID to avoid duplicate processing
    };

    return jobData;
  } catch (error) {
    console.error('Error parsing generic application email:', error);
    return null;
  }
}

/**
 * Parse generic (non-LinkedIn) job response emails (rejections, interviews, etc.)
 * @param {Object} email - Email object with subject, html, text and date properties
 * @param {string} defaultResponse - Default response type if unable to determine from content
 * @returns {Promise<Object|null>} Parsed response data or null if invalid
 */
async function parseGenericResponseEmail(email, defaultResponse = null) {
  try {
    // Get email metadata
    const subject = email.subject || '';
    const fromAddress = email.from ? email.from.text || '' : '';
    const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1].split('>')[0] : '';
    const emailDate = new Date(email.date);
    const textContent = email.text || '';
    const htmlContent = email.html || '';

    // Initialize cheerio with the email HTML content if available
    const $ = htmlContent ? cheerio.load(htmlContent) : null;

    // Extract company name - multiple strategies (similar to application email)
    let company = '';

    // Strategy 1: Try to extract from the from address domain
    if (fromDomain) {
      // Remove common email providers and extract company name
      if (!fromDomain.match(/gmail|hotmail|outlook|yahoo|aol|icloud|protonmail/i)) {
        const domainParts = fromDomain.split('.');
        if (domainParts.length >= 2) {
          company = domainParts[domainParts.length - 2].charAt(0).toUpperCase() +
                   domainParts[domainParts.length - 2].slice(1);
        }
      }
    }

    // Strategy 2: Try to extract from the email address display name
    if (!company && fromAddress) {
      const fromNameMatch = fromAddress.match(/^"?([^"<]+)"?\s*</);
      if (fromNameMatch && fromNameMatch[1]) {
        // Check if the display name contains terms like "HR", "Recruiting", etc.
        const displayName = fromNameMatch[1].trim();
        if (!displayName.match(/^(HR|Recruiting|Talent|Careers|Jobs|Applications|Human Resources|Notifications|No Reply|DoNotReply|Careers Portal)$/i)) {
          // If it's not just a generic department name, it might be the company
          company = displayName;
        }
      }
    }

    // Strategy 3: Try to extract from the subject
    if (!company) {
      const companyMatches = subject.match(/from (.+)|at (.+)|to (.+)|for (.+)|application to (.+)|(update|response) from (.+)/i);
      if (companyMatches) {
        for (let i = 1; i < companyMatches.length; i++) {
          if (companyMatches[i] && i !== 6) { // Skip the "update" or "response" group
            company = companyMatches[i].trim();
            break;
          }
        }
      }
    }

    // Strategy 4: Check for common patterns in text content
    if (!company) {
      const companyPatterns = [
        /thank you for (applying|your application) (to|at|with) ([^,.]+)/i,
        /regarding your application (to|at|with) ([^,.]+)/i,
        /your application (to|at|with) ([^,.]+)/i,
        /team at ([^,.]+)/i,
        /([^,.]+?) team/i,
        /([^,.]+?) recruiter/i,
        /([^,.]+?) careers/i,
        /from ([^,.]+?) recruitment/i
      ];

      for (const pattern of companyPatterns) {
        const match = textContent.match(pattern) || htmlContent.match(pattern);
        if (match) {
          // Different patterns have the company name in different capture groups
          const companyGroup = pattern.toString().includes('thank you for') ? 3 :
                               pattern.toString().includes('regarding your application') ? 2 :
                               pattern.toString().includes('your application') ? 2 : 1;

          if (match[companyGroup]) {
            company = match[companyGroup].trim();
            break;
          }
        }
      }
    }

    // If we still can't determine the company, try the email signature
    if (!company && $) {
      $('div.signature, div.footer, footer, div[class*="footer"], div[class*="signature"]').each((i, el) => {
        const text = $(el).text().trim();
        const lines = text.split('\n');
        if (lines.length && lines[0].length > 2 && lines[0].length < 50) {
          company = lines[0].trim();
          return false;
        }
      });
    }

    // If all else fails, try to make an educated guess from the email domain
    if (!company && fromDomain) {
      company = fromDomain.split('.')[0];
      // Capitalize first letter
      if (company) {
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    }

    // Extract job title - multiple strategies
    let jobTitle = '';

    // Strategy 1: Check subject line for job title
    const roleMatches = subject.match(/for (.+?) role|for (.+?) position|for (?:the )?(.+)|(.+?) application|your application (?:for|to) (.+)/i);
    if (roleMatches) {
      for (let i = 1; i < roleMatches.length; i++) {
        if (roleMatches[i]) {
          jobTitle = roleMatches[i].trim();
          // Clean up common phrases that aren't part of the job title
          jobTitle = jobTitle.replace(/^(the|your|a|an) /i, '')
                           .replace(/ position$| role$| job$| opening$| application$| received$| complete$/i, '');
          break;
        }
      }
    }

    // Strategy 2: Look for job title patterns in the email content
    if (!jobTitle && $) {
      $('p, div, span, h1, h2, h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();

        // Common patterns for job titles in response emails
        const positionMatch = text.match(/position[:\s]+([^,.]+)/i) ||
                             text.match(/role[:\s]+([^,.]+)/i) ||
                             text.match(/job[:\s]+([^,.]+)/i) ||
                             text.match(/(?:regarding|for) (?:the )?([^,.]+?) (?:position|role|job|opening)/i);

        if (positionMatch && positionMatch[1]) {
          jobTitle = positionMatch[1].trim();
          return false; // break the loop
        }
      });
    }

    // If still no job title, try patterns in text content
    if (!jobTitle) {
      const titlePatterns = [
        /position[:\s]+([^,.]+)/i,
        /role[:\s]+([^,.]+)/i,
        /job[:\s]+([^,.]+)/i,
        /(?:regarding|for) (?:the )?([^,.]+?) (?:position|role|job|opening)/i,
        /your application for (?:the )?([^,.]+)/i
      ];

      for (const pattern of titlePatterns) {
        const match = textContent.match(pattern) || htmlContent.match(pattern);
        if (match && match[1]) {
          jobTitle = match[1].trim();
          break;
        }
      }
    }

    // If we still can't find a job title, use a generic one with the company name
    if (!jobTitle && company) {
      jobTitle = `Position at ${company}`;
    }

    // Determine the response type: Rejected, Interview, Offer
    let response = defaultResponse || 'No Response';
    let responseDescription = 'response';

    // Check for rejection patterns
    const rejectionPatterns = [
      /unfortunately/i,
      /not (?:a )?match/i,
      /not (?:be )?moving forward/i,
      /other candidates/i,
      /regret to inform/i,
      /pursued other candidates/i,
      /no longer being considered/i,
      /we have (?:decided to )?proceed with other/i,
      /thank you for your interest/i,
      /position has been filled/i,
      /selected (?:another|other) candidate/i
    ];

    // Check for interview invitation patterns
    const interviewPatterns = [
      /interview/i,
      /next steps?/i,
      /would like to (?:meet|speak|talk)/i,
      /schedule (?:a|an) (?:call|meeting|interview)/i,
      /follow(?:\s|-)?up (?:call|meeting|interview)/i,
      /move(?:ing)? forward/i,
      /like to invite you/i,
      /screening (?:call|interview)/i
    ];

    // Check for offer patterns
    const offerPatterns = [
      /(?:job|position) offer/i,
      /pleased to offer/i,
      /congratulations/i,
      /welcome to the team/i,
      /formally offer/i,
      /offer letter/i,
      /offer of employment/i
    ];

    // Search for patterns in both text and HTML content
    const contentToSearch = textContent + ' ' + htmlContent;

    // // First check for offers (highest priority)
    // for (const pattern of offerPatterns) {
    //   if (pattern.test(contentToSearch)) {
    //     response = 'Offer';
    //     responseDescription = 'job offer';
    //     break;
    //   }
    // }

    // // If not an offer, check for interview invitations
    // if (response === defaultResponse || response === 'No Response') {
    //   for (const pattern of interviewPatterns) {
    //     if (pattern.test(contentToSearch)) {
    //       response = 'Interview';
    //       responseDescription = 'interview invitation';
    //       break;
    //     }
    //   }
    // }

    // If neither offer nor interview, check for rejections
    if (response === defaultResponse || response === 'No Response') {
      for (const pattern of rejectionPatterns) {
        if (pattern.test(contentToSearch)) {
          response = 'Rejected';
          responseDescription = 'rejection';
          break;
        }
      }
    }

    // Extract job URL if available
    let website = '';
    if ($) {
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim().toLowerCase();
        if (href && (text.includes('view') || text.includes('job') || text.includes('position') ||
                   text.includes('details') || text.includes('apply') || text.includes('careers'))) {
          website = href;
          return false; // break the loop
        }
      });
    }

    // Prepare notes with appropriate information
    const notes = `Received a ${responseDescription} from ${company} for ${jobTitle} position on ${emailDate.toLocaleDateString()}`;

    // Create the response object with the extracted information
    return {
      company: company || 'Unknown Company',
      jobTitle: jobTitle || 'Unknown Position',
      response,
      website,
      externalJobId: '', // Usually not available in generic emails
      notes,
      responded: emailDate,
      itemType: 'response',
      emailId: email.messageId // Store message ID to avoid duplicate processing
    };
  } catch (error) {
    console.error('Error parsing generic response email:', error);
    return null;
  }
}