const { scan } = require('./index');

scan()
  .then((count) => {
    console.log(`Scanned ${count} files.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
