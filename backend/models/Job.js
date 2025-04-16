const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  source: {
    type: String
  },
  searchType: {
    type: String
  },
  applicationThrough: {
    type: String
  },
  company: {
    type: String,
    required: true
  },
  companyLocation: {
    type: String
  },
  locationType: {
    type: String,
    enum: ['Remote', 'On-site', 'On-Site', 'Hybrid', 'Other']
  },
  employmentType: {
    type: String,
    enum: ['Full-time', 'Full-Time', 'Part-time', 'Part-Time', 'Contract', 'Internship', 'Freelance', 'Other']
  },
  jobTitle: {
    type: String,
    required: true
  },
  wagesMin: {
    type: Number
  },
  wagesMax: {
    type: Number
  },
  wageType: {
    type: String,
    enum: ['Hourly', 'Salary', 'Yearly', 'Monthly', 'Weekly', 'Project', 'Other']
  },
  applied: {
    type: Date,
    default: Date.now
  },
  statusChecks: [{
    date: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String
    }
  }],
  responded: {
    type: Date,
    default: null
  },
  response: {
    type: String,
    enum: ['No Response', 'Rejected', 'Phone Screen', 'Interview', 'Offer', 'Hired', 'Other']
  },
  website: {
    type: String
  },
  description: {
    type: String
  },
  externalJobId: {
    type: String
  },
  notes: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Job', JobSchema);