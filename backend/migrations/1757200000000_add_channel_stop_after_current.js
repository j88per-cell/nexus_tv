exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('channels', {
    stop_after_current: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('channels', 'stop_after_current');
};
