const REQUIRED_NODE_VERSION = '24.22.1';

if (process.versions.node !== REQUIRED_NODE_VERSION) {
  console.error(
    `Viking vs Cleo requires Node.js ${REQUIRED_NODE_VERSION}; current version is ${process.versions.node}. ` +
      'Install/select the version from .nvmrc before starting the server.',
  );
  process.exit(1);
}

try {
  await import('node:sqlite');
} catch (error) {
  console.error(`Node.js ${REQUIRED_NODE_VERSION} must provide node:sqlite: ${error.message}`);
  process.exit(1);
}

console.log(`Runtime OK: Node.js ${REQUIRED_NODE_VERSION} with node:sqlite.`);
