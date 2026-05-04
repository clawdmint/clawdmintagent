// Cross-platform launcher for the cPEG offline verification harness.
// Boots ts-node + tsconfig-paths in-process so the @/ alias resolves
// correctly regardless of the host shell (cmd / PowerShell / bash).
const path = require("path");

const projectPath = path.join(__dirname, "tsconfig.scripts.json");
process.env.TS_NODE_PROJECT = projectPath;

require("ts-node").register({
  project: projectPath,
  transpileOnly: true,
});
require("tsconfig-paths/register");

require("./cpeg-offline-verify.ts");
