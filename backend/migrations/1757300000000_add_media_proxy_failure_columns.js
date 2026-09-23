exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('media_files', {
    proxy_failed_at: { type: 'timestamptz' },
    proxy_last_error: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('media_files', ['proxy_failed_at', 'proxy_last_error']);
};
