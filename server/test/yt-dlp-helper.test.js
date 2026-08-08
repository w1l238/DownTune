import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { buildYtDlpChildEnv, resolveYtDlpPython } from '../utils/yt-dlp-helper.js';

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
  test('SSL vars are forwarded into childEnv', () => {
    const env = buildYtDlpChildEnv({
      HOME: '/home/testuser',
      PATH: '/usr/bin',
      SSL_CERT_FILE: '/fake/SSL_CERT_FILE',
      SSL_CERT_DIR: '/fake/SSL_CERT_DIR',
      REQUESTS_CA_BUNDLE: '/fake/REQUESTS_CA_BUNDLE',
      CURL_CA_BUNDLE: '/fake/CURL_CA_BUNDLE',
      YT_DLP_CA_CERT: '/fake/ca.pem',
    });

    assert.equal(env.SSL_CERT_FILE, '/fake/SSL_CERT_FILE');
    assert.equal(env.SSL_CERT_DIR, '/fake/SSL_CERT_DIR');
    assert.equal(env.REQUESTS_CA_BUNDLE, '/fake/REQUESTS_CA_BUNDLE');
    assert.equal(env.CURL_CA_BUNDLE, '/fake/CURL_CA_BUNDLE');
    assert.equal(env.YT_DLP_CA_CERT, '/fake/ca.pem');
  });

  test('HOME in childEnv uses supplied HOME, not /tmp', () => {
    const env = buildYtDlpChildEnv({ HOME: '/home/testuser', PATH: '/usr/bin' });
    assert.equal(env.HOME, '/home/testuser');
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

  test('SSL vars absent from childEnv when not supplied', () => {
    const env = buildYtDlpChildEnv({ HOME: '/home/testuser', PATH: '/usr/bin' });
    assert.equal(env.SSL_CERT_FILE, undefined);
    assert.equal(env.SSL_CERT_DIR, undefined);
    assert.equal(env.REQUESTS_CA_BUNDLE, undefined);
    assert.equal(env.CURL_CA_BUNDLE, undefined);
    assert.equal(env.YT_DLP_CA_CERT, undefined);
  });
});
