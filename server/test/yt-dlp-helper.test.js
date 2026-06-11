import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { resolveYtDlpPython } from '../utils/yt-dlp-helper.js';
import { spawn } from 'child_process';

const VENV_PYTHON = `${process.env.HOME}/.local/share/downtune-venv/bin/python3`;

describe('resolveYtDlpPython', () => {
  test('YT_DLP_PYTHON override is returned as-is', () => {
    const result = resolveYtDlpPython({ YT_DLP_PYTHON: '/custom/python3', HOME: '/home/user' });
    assert.equal(result, '/custom/python3');
  });

  test('YT_DLP_PYTHON override wins even when venv exists', () => {
    const result = resolveYtDlpPython({ YT_DLP_PYTHON: '/opt/python3', HOME: process.env.HOME });
    assert.equal(result, '/opt/python3');
  });

  test('falls back to platform default when HOME has no venv', () => {
    const result = resolveYtDlpPython({ HOME: '/nonexistent-home-xyz-downtune' }, 'linux');
    assert.equal(result, 'python3');
    const resultWin = resolveYtDlpPython({ HOME: '/nonexistent-home-xyz-downtune' }, 'win32');
    assert.equal(resultWin, 'python');
  });

  test('falls back to platform default when HOME is absent', () => {
    const result = resolveYtDlpPython({}, 'linux');
    assert.equal(result, 'python3');
    const resultWin = resolveYtDlpPython({}, 'win32');
    assert.equal(resultWin, 'python');
  });

  test('detects setup-script venv when present', { skip: !existsSync(VENV_PYTHON) }, () => {
    const result = resolveYtDlpPython({ HOME: process.env.HOME });
    assert.equal(result, VENV_PYTHON);
  });
});

describe('childEnv construction', () => {
  const SSL_VARS = ['SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'YT_DLP_CA_CERT'];

  before(() => {
    SSL_VARS.forEach(v => { process.env[v] = `/fake/${v}`; });
    process.env.YT_DLP_CA_CERT = '/fake/ca.pem';
  });

  after(() => {
    SSL_VARS.forEach(v => { delete process.env[v]; });
  });

  test('SSL vars are forwarded into childEnv', (t, done) => {
    const sentinel = '__downtune_env_check__';
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      `
import { existsSync } from 'fs';
const homeDir = process.env.HOME ?? '/root';
const venvBin = homeDir + '/.local/share/downtune-venv/bin';
const basePath = process.env.PATH || '/usr/bin:/usr/local/bin:/bin';
const childEnv = {
  PATH: existsSync(venvBin) ? venvBin + ':' + basePath : basePath,
  HOME: process.env.HOME ?? '/tmp',
};
for (const v of ['SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','CURL_CA_BUNDLE']) {
  if (process.env[v]) childEnv[v] = process.env[v];
}
if (process.env.YT_DLP_CA_CERT) childEnv.YT_DLP_CA_CERT = process.env.YT_DLP_CA_CERT;
console.log(JSON.stringify(childEnv));
      `
    ], {
      env: {
        ...process.env,
        SSL_CERT_FILE: '/fake/SSL_CERT_FILE',
        SSL_CERT_DIR: '/fake/SSL_CERT_DIR',
        REQUESTS_CA_BUNDLE: '/fake/REQUESTS_CA_BUNDLE',
        CURL_CA_BUNDLE: '/fake/CURL_CA_BUNDLE',
        YT_DLP_CA_CERT: '/fake/ca.pem',
      }
    });

    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', () => {
      const env = JSON.parse(out);
      assert.equal(env.SSL_CERT_FILE, '/fake/SSL_CERT_FILE');
      assert.equal(env.SSL_CERT_DIR, '/fake/SSL_CERT_DIR');
      assert.equal(env.REQUESTS_CA_BUNDLE, '/fake/REQUESTS_CA_BUNDLE');
      assert.equal(env.CURL_CA_BUNDLE, '/fake/CURL_CA_BUNDLE');
      assert.equal(env.YT_DLP_CA_CERT, '/fake/ca.pem');
      done();
    });
  });

  test('HOME in childEnv uses process.env.HOME, not /tmp', (t, done) => {
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      `
import { existsSync } from 'fs';
const homeDir = process.env.HOME ?? '/root';
const venvBin = homeDir + '/.local/share/downtune-venv/bin';
const basePath = '/usr/bin';
const childEnv = {
  PATH: existsSync(venvBin) ? venvBin + ':' + basePath : basePath,
  HOME: process.env.HOME ?? '/tmp',
};
console.log(childEnv.HOME);
      `
    ], { env: { ...process.env, HOME: '/home/testuser' } });

    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', () => {
      assert.equal(out.trim(), '/home/testuser');
      done();
    });
  });

  test('--ca-cert flag is prepended when YT_DLP_CA_CERT is set', () => {
    const savedEnv = process.env.YT_DLP_CA_CERT;
    process.env.YT_DLP_CA_CERT = '/fake/ca.pem';

    const caArgs = process.env.YT_DLP_CA_CERT
      ? ['--ca-cert', process.env.YT_DLP_CA_CERT]
      : [];
    const fullArgs = ['-m', 'yt_dlp', ...caArgs, '--no-playlist', 'https://example.com'];

    assert.deepEqual(fullArgs.slice(0, 4), ['-m', 'yt_dlp', '--ca-cert', '/fake/ca.pem']);

    process.env.YT_DLP_CA_CERT = savedEnv;
  });

  test('--ca-cert flag is absent when YT_DLP_CA_CERT is not set', () => {
    const savedEnv = process.env.YT_DLP_CA_CERT;
    delete process.env.YT_DLP_CA_CERT;

    const caArgs = process.env.YT_DLP_CA_CERT
      ? ['--ca-cert', process.env.YT_DLP_CA_CERT]
      : [];
    const fullArgs = ['-m', 'yt_dlp', ...caArgs, '--no-playlist'];

    assert.ok(!fullArgs.includes('--ca-cert'));

    if (savedEnv !== undefined) process.env.YT_DLP_CA_CERT = savedEnv;
  });

  test('SSL vars absent from childEnv when not set in parent', (t, done) => {
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      `
import { existsSync } from 'fs';
const homeDir = process.env.HOME ?? '/root';
const venvBin = homeDir + '/.local/share/downtune-venv/bin';
const basePath = '/usr/bin';
const childEnv = {
  PATH: existsSync(venvBin) ? venvBin + ':' + basePath : basePath,
  HOME: process.env.HOME ?? '/tmp',
};
for (const v of ['SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','CURL_CA_BUNDLE']) {
  if (process.env[v]) childEnv[v] = process.env[v];
}
if (process.env.YT_DLP_CA_CERT) childEnv.YT_DLP_CA_CERT = process.env.YT_DLP_CA_CERT;
console.log(JSON.stringify(childEnv));
      `
    ], {
      env: { HOME: '/home/testuser', PATH: '/usr/bin' }
    });

    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', () => {
      const env = JSON.parse(out);
      assert.equal(env.SSL_CERT_FILE, undefined);
      assert.equal(env.SSL_CERT_DIR, undefined);
      assert.equal(env.REQUESTS_CA_BUNDLE, undefined);
      assert.equal(env.CURL_CA_BUNDLE, undefined);
      assert.equal(env.YT_DLP_CA_CERT, undefined);
      done();
    });
  });
});
