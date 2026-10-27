import { buildApp } from './app.js';

const { app, config, descriptors, store } = buildApp();

const server = app.listen(config.port, () => {
  const paths = new Set(descriptors.map((route) => route.path)).size;
  console.log(
    `Modern Treasury API listening on http://localhost:${config.port}\n` +
      `  mode:        ${config.liveMode ? 'live' : 'sandbox (test)'}\n` +
      `  catalog:     ${descriptors.length} operations / ${paths} paths\n` +
      `  credentials: ${config.organizationId}:${[...config.apiKeys][0]}\n` +
      `  seeded:      ${Object.values(store.stats()).reduce((a, b) => a + b, 0)} records` +
      (config.persistPath ? `\n  persistence: ${config.persistPath}` : '') +
      (config.webhookUrl ? `\n  webhooks:    ${config.webhookUrl}` : '')
  );
});

function shutdown(signal) {
  return () => {
    if (config.persistPath) store.save();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
    console.log(`\n${signal} received, shutting down`);
  };
}

process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));
