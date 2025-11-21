const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'tribes.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({ tribus: {} }, null, 2));
}

function loadTribes() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataPath));
}

function saveTribes(data) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = { ensureDataFile, loadTribes, saveTribes };
