import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { resolveYtDlpPython } from '../utils/yt-dlp-helper.js';

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

  test('falls back to python3 when HOME has no venv', () => {
    const result = resolveYtDlpPython({ HOME: '/nonexistent-home-xyz-downtune' });
    assert.equal(result, 'python3');
  });

  test('falls back to python3 when HOME is absent', () => {
    const result = resolveYtDlpPython({});
    assert.equal(result, 'python3');
  });

  test('detects setup-script venv when present', { skip: !existsSync(VENV_PYTHON) }, () => {
    const result = resolveYtDlpPython({ HOME: process.env.HOME });
    assert.equal(result, VENV_PYTHON);
  });
});
