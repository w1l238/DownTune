import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { info } from '../logger.js';

// Resolution order: YT_DLP_PYTHON env override → setup-script venv → system python3/python
export function resolveYtDlpPython(env = process.env, platform = process.platform) {
  if (env.YT_DLP_PYTHON) return env.YT_DLP_PYTHON;
  const candidate = `${env.HOME ?? env.USERPROFILE ?? '/root'}/.local/share/downtune-venv/bin/python3`;
  if (existsSync(candidate)) return candidate;
  return platform === 'win32' ? 'python' : 'python3';
}

const PYTHON_BIN = resolveYtDlpPython();

export function buildYtDlpChildEnv(env = process.env) {
  const homeDir = env.HOME ?? env.USERPROFILE ?? '/root';
  const venvBin = `${homeDir}/.local/share/downtune-venv/bin`;
  const basePath = env.PATH || '/usr/bin:/usr/local/bin:/bin';
  const childEnv = {
    PATH: existsSync(venvBin) ? `${venvBin}:${basePath}` : basePath,
    HOME: env.HOME ?? env.USERPROFILE ?? '/tmp',
  };

  for (const name of ['SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE']) {
    if (env[name]) childEnv[name] = env[name];
  }
  if (env.YT_DLP_CA_CERT) childEnv.YT_DLP_CA_CERT = env.YT_DLP_CA_CERT;
  if (env.LANG) childEnv.LANG = env.LANG;
  if (env.LC_ALL) childEnv.LC_ALL = env.LC_ALL;

  return childEnv;
}

export const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    const caArgs = process.env.YT_DLP_CA_CERT
      ? ['--ca-cert', process.env.YT_DLP_CA_CERT]
      : [];
    const fullArgs = ['-m', 'yt_dlp', ...caArgs, ...args];
    if (process.env.NODE_ENV !== 'production') info(`[DEBUG] Executing: ${PYTHON_BIN} ${fullArgs.join(' ')}`);

    const childProcess = spawn(PYTHON_BIN, fullArgs, { env: buildYtDlpChildEnv() });
    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data) => stdout += data.toString());
    childProcess.stderr.on('data', (data) => stderr += data.toString());

    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`yt-dlp process exited with code ${code}: ${stderr}`));
      }
    });
    childProcess.on('error', (err) => reject(err));
  });
};
