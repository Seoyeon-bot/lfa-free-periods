// Used only in the trusted main-branch deploy job. Never prints credentials.
const fs = require('node:fs');
const path = require('node:path');
function config(env) {
  const names = ['CLASPRC_JSON', 'APPS_SCRIPT_ID', 'APPS_SCRIPT_DEPLOYMENT_ID'];
  for (const key of names)
    if (!env[key]?.trim())
      throw new Error('Missing GitHub Actions secret: ' + key);
  let auth;
  try {
    auth = JSON.parse(env.CLASPRC_JSON);
  } catch {
    throw new Error(
      'CLASPRC_JSON must contain the complete JSON from clasp login.'
    );
  }
  if (
    !auth ||
    typeof auth !== 'object' ||
    Array.isArray(auth) ||
    !Object.keys(auth).length
  )
    throw new Error('CLASPRC_JSON must be a nonempty JSON object.');
  const scriptId = env.APPS_SCRIPT_ID.trim(),
    deploymentId = env.APPS_SCRIPT_DEPLOYMENT_ID.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(scriptId))
    throw new Error('APPS_SCRIPT_ID must be the Script ID, not a URL.');
  if (!/^AKfy[A-Za-z0-9_-]+$/.test(deploymentId))
    throw new Error(
      'APPS_SCRIPT_DEPLOYMENT_ID must be the web app deployment ID, not its URL.'
    );
  return { auth, project: { scriptId, rootDir: 'src' }, deploymentId };
}
function prepare(env, root) {
  const c = config(env); // Validate everything before writing either file.
  for (const [name, data] of [
    ['.clasprc.json', c.auth],
    ['.clasp.json', c.project]
  ]) {
    fs.writeFileSync(path.join(root, name), JSON.stringify(data), {
      mode: 0o600,
      flag: 'wx'
    });
  }
}
function clean(root) {
  for (const name of ['.clasprc.json', '.clasp.json'])
    fs.rmSync(path.join(root, name), { force: true });
}
if (require.main === module) {
  try {
    if (process.argv.includes('--clean')) clean(process.cwd());
    else prepare(process.env, process.cwd());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { config, prepare, clean };
