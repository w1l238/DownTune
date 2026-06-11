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

export const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    const caArgs = process.env.YT_DLP_CA_CERT
      ? ['--ca-cert', process.env.YT_DLP_CA_CERT]
      : [];
    const fullArgs = ['-m', 'yt_dlp', ...caArgs, ...args];
    info(`[DEBUG] Executing: ${PYTHON_BIN} ${fullArgs.join(' ')}`);

    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '/root';
    const venvBin = `${homeDir}/.local/share/downtune-venv/bin`;
    const basePath = process.env.PATH || '/usr/bin:/usr/local/bin:/bin';
    const childEnv = {
      PATH: existsSync(venvBin) ? `${venvBin}:${basePath}` : basePath,
      HOME: process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
    };
    for (const v of ['SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE']) {
      if (process.env[v]) childEnv[v] = process.env[v];
    }
    if (process.env.YT_DLP_CA_CERT) childEnv.YT_DLP_CA_CERT = process.env.YT_DLP_CA_CERT;
    if (process.env.LANG) childEnv.LANG = process.env.LANG;
    if (process.env.LC_ALL) childEnv.LC_ALL = process.env.LC_ALL;

    const childProcess = spawn(PYTHON_BIN, fullArgs, { env: childEnv });
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
