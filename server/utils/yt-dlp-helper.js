import { spawn } from 'child_process';
import { info } from '../logger.js';

/**
 * Helper to run yt-dlp directly
 * @param {string[]} args 
 * @returns {Promise<string>}
 */
export const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    const fullArgs = ['-m', 'yt_dlp', ...args];
    info(`[DEBUG] Executing: python3 ${fullArgs.join(' ')}`);

    const childProcess = spawn('python3', fullArgs, {
      env: { ...process.env, HOME: '/tmp' }
    });
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
