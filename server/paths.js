const path = require('path');
const fs = require('fs');

/** На Railway: примонтированный том, напр. /data — задать DATA_DIR=/data в Variables */
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

const uploadsDir = path.join(dataDir, 'uploads');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

module.exports = {
  dataDir,
  uploadsDir,
  dbPath: path.join(dataDir, 'gchat.db'),
};
