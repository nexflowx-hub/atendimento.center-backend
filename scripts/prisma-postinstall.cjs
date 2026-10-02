// Honor the explicit offline/schema-only installation workflow.
if (process.env.PRISMA_SKIP_POSTINSTALL_GENERATE !== '1') {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'generate'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
