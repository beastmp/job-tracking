const mongoose = require('mongoose');
const crypto = require('crypto');
const config = require('../config');

// Get encryption key from config
const ENCRYPTION_KEY = config.security.encryptionKey;

// Generate a stable key for encryption
const getEncryptionKey = () => {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY === 'replace_with_32_character_random_string') {
    console.error('WARNING: Using default encryption key. Set ENCRYPTION_KEY in your environment variables!');
  }

  // Create a 32-byte key (256 bits) for AES-256
  return crypto
    .createHash('sha256')
    .update(ENCRYPTION_KEY || 'temporary-dev-key-do-not-use-in-production')
    .digest('hex')
    .slice(0, 32);
};

// Encrypt password
const encryptPassword = (password) => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // Initialization vector
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Store IV with the encrypted password
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
};

// Decrypt password
const decryptPassword = (encryptedPassword) => {
  try {
    const key = getEncryptionKey();
    const parts = encryptedPassword.split(':');

    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

const EmailCredentialsSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  imapHost: {
    type: String,
    required: true
  },
  imapPort: {
    type: String,
    required: true
  },
  useTLS: {
    type: Boolean,
    default: true
  },
  rejectUnauthorized: {
    type: Boolean,
    default: true
  },
  autoImport: {
    type: Boolean,
    default: false
  },
  searchTimeframeDays: {
    type: Number,
    default: config.email.imap.searchTimeframeDays,
    min: 1,
    max: 365
  },
  searchFolders: {
    type: [String],
    default: config.email.imap.searchFolders
  },
  lastImport: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Encrypt password before saving
EmailCredentialsSchema.pre('save', function(next) {
  // Only encrypt if password is modified
  if (!this.isModified('password')) return next();

  const encrypted = encryptPassword(this.password);
  if (!encrypted) {
    return next(new Error('Failed to encrypt password'));
  }

  this.password = encrypted;
  next();
});

// Method to decrypt password
EmailCredentialsSchema.methods.decryptPassword = function() {
  return decryptPassword(this.password);
};

module.exports = mongoose.model('EmailCredentials', EmailCredentialsSchema);