exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('media_files', {
    proxy_path: { type: 'text' },
    proxied_at: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('media_files', ['proxy_path', 'proxied_at']);
};
