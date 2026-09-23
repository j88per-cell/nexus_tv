const { extendAllActiveChannels } = require('./generate');

extendAllActiveChannels()
  .then((results) => {
    console.log('Schedule generation results:', results);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
