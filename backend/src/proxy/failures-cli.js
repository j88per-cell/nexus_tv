const { listFailures, retryFailure, retryAllFailures } = require('./failures');

// Usage:
//   node src/proxy/failures-cli.js list
//   node src/proxy/failures-cli.js retry <media_file_id>
//   node src/proxy/failures-cli.js retry-all

async function main() {
  const [, , command, arg] = process.argv;

  if (command === 'list' || !command) {
    const failures = await listFailures();
    if (failures.length === 0) {
      console.log('No failed files.');
      return;
    }
    for (const f of failures) {
      console.log(`[${f.id}] ${f.absolute_path}`);
      console.log(`  failed_at: ${f.proxy_failed_at}`);
      console.log(`  error: ${f.proxy_last_error}`);
      console.log('');
    }
    console.log(`${failures.length} failed file(s).`);
    return;
  }

  if (command === 'retry') {
    if (!arg) throw new Error('Usage: failures-cli.js retry <media_file_id>');
    const ok = await retryFailure(Number(arg));
    console.log(ok ? `Cleared failure for file ${arg}.` : `No failed file with id ${arg}.`);
    return;
  }

  if (command === 'retry-all') {
    const count = await retryAllFailures();
    console.log(`Cleared failure on ${count} file(s).`);
    return;
  }

  throw new Error(`Unknown command "${command}". Use: list | retry <id> | retry-all`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
