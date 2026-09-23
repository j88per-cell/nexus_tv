exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('channel_rules', {
    // Position in the channel's rotation cycle (0-based). A plain single-rule channel just
    // has one row at block_order 0 — this is a superset of the old "exactly one rule" model,
    // not a breaking change for existing channels.
    block_order: { type: 'integer', notNull: true, default: 0 },
    // How many units to pull from this rule per cycle before moving to the next slot
    // (e.g. 1 movie, then 2 TV episodes, repeat).
    block_count: { type: 'integer', notNull: true, default: 1 },
  });
  pgm.createIndex('channel_rules', ['channel_id', 'block_order']);
};

exports.down = (pgm) => {
  pgm.dropColumns('channel_rules', ['block_order', 'block_count']);
};
