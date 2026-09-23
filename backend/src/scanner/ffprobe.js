const { execFile } = require('child_process');
const config = require('../config');

function getDurationSeconds(absolutePath) {
  return new Promise((resolve, reject) => {
    execFile(
      config.ffprobeBin,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', absolutePath],
      { maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(stdout);
          const duration = parseFloat(parsed.format?.duration);
          if (!Number.isFinite(duration)) return reject(new Error('No duration in ffprobe output'));
          resolve(duration);
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

module.exports = { getDurationSeconds };
