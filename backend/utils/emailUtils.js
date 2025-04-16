const cheerio = require('cheerio');

/**
 * Email-related utility functions
 */

/**
 * Parse Excel date values
 * @param {any} value Value from Excel
 * @returns {Date|null} Date object or null if invalid
 */
exports.parseExcelDate = (value) => {
  if (!value) return null;

  // If it's already a Date object
  if (value instanceof Date) return value;

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    // Try different date formats
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }

  // If it's a number (Excel serial date)
  if (typeof value === 'number') {
    // Excel dates are number of days since 1/1/1900
    // But in JavaScript dates are milliseconds since 1/1/1970
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
    return date;
  }

  return null;
};
