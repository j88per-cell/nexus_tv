const { generateProxies } = require('./generate');

generateProxies()
  .then(({ attempted, succeeded }) => {
    console.log(`Proxied ${succeeded}/${attempted} files.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
