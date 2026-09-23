exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('episode_groups', {
    id: 'id',
    name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('media_files', {
    id: 'id',
    absolute_path: { type: 'text', notNull: true, unique: true },
    kind: { type: 'text', notNull: true, check: "kind in ('movie', 'episode')" },
    title: { type: 'text', notNull: true },
    show_name: { type: 'text' },
    season: { type: 'integer' },
    episode: { type: 'integer' },
    duration_seconds: { type: 'numeric' },
    file_size: { type: 'bigint' },
    group_id: { type: 'integer', references: 'episode_groups', onDelete: 'set null' },
    part_number: { type: 'integer' },
    added_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('media_files', 'show_name');
  pgm.createIndex('media_files', 'group_id');

  pgm.createTable('channels', {
    id: 'id',
    number: { type: 'integer', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // MVP: exactly one active rule per channel, enforced at the application layer.
  pgm.createTable('channel_rules', {
    id: 'id',
    channel_id: { type: 'integer', notNull: true, references: 'channels', onDelete: 'cascade' },
    rule_type: { type: 'text', notNull: true, check: "rule_type in ('folder', 'show')" },
    rule_value: { type: 'text', notNull: true },
    shuffle: { type: 'boolean', notNull: true, default: false },
  });
  pgm.createIndex('channel_rules', 'channel_id');

  pgm.createTable('channel_overrides', {
    id: 'id',
    channel_id: { type: 'integer', notNull: true, references: 'channels', onDelete: 'cascade' },
    media_file_id: { type: 'integer', references: 'media_files', onDelete: 'cascade' },
    group_id: { type: 'integer', references: 'episode_groups', onDelete: 'cascade' },
    override_type: { type: 'text', notNull: true, check: "override_type in ('pin', 'exclude')" },
    pin_position: { type: 'integer' },
  });
  pgm.addConstraint('channel_overrides', 'channel_overrides_target_check',
    'CHECK ((media_file_id IS NOT NULL) <> (group_id IS NOT NULL))');
  pgm.createIndex('channel_overrides', 'channel_id');

  pgm.createTable('channel_schedule', {
    id: 'id',
    channel_id: { type: 'integer', notNull: true, references: 'channels', onDelete: 'cascade' },
    media_file_id: { type: 'integer', notNull: true, references: 'media_files', onDelete: 'cascade' },
    scheduled_start: { type: 'timestamptz', notNull: true },
    scheduled_end: { type: 'timestamptz', notNull: true },
    sort_order: { type: 'bigint', notNull: true },
    served: { type: 'boolean', notNull: true, default: false },
  });
  pgm.createIndex('channel_schedule', ['channel_id', 'sort_order']);
  pgm.createIndex('channel_schedule', ['channel_id', 'served']);
};

exports.down = (pgm) => {
  pgm.dropTable('channel_schedule');
  pgm.dropTable('channel_overrides');
  pgm.dropTable('channel_rules');
  pgm.dropTable('channels');
  pgm.dropTable('media_files');
  pgm.dropTable('episode_groups');
};
