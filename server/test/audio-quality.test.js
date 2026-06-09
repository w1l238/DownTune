import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUDIO_QUALITY_PRESET,
  getAudioQualityPreset,
  validateAudioQualityPreset,
  getYtDlpAudioQualityArgs,
  getAudioQualityPresetOptions,
} from '../utils/audio-quality.js';

describe('audio-quality defaults', () => {
  test('DEFAULT_AUDIO_QUALITY_PRESET is high', () => {
    assert.equal(DEFAULT_AUDIO_QUALITY_PRESET, 'high');
  });

  test('missing value returns high', () => {
    assert.equal(getAudioQualityPreset(undefined), 'high');
  });

  test('empty string returns high', () => {
    assert.equal(getAudioQualityPreset(''), 'high');
  });

  test('null returns high', () => {
    assert.equal(getAudioQualityPreset(null), 'high');
  });

  test('unknown value returns high', () => {
    assert.equal(getAudioQualityPreset('garbage'), 'high');
    assert.equal(getAudioQualityPreset('opus'), 'high');
  });
});

describe('audio-quality known presets', () => {
  test('balanced is valid', () => {
    assert.equal(getAudioQualityPreset('balanced'), 'balanced');
  });

  test('high is valid', () => {
    assert.equal(getAudioQualityPreset('high'), 'high');
  });

  test('max is valid', () => {
    assert.equal(getAudioQualityPreset('max'), 'max');
  });

  test('preset lookup is case-insensitive', () => {
    assert.equal(getAudioQualityPreset('HIGH'), 'high');
    assert.equal(getAudioQualityPreset('Balanced'), 'balanced');
    assert.equal(getAudioQualityPreset('MAX'), 'max');
  });
});

describe('getYtDlpAudioQualityArgs', () => {
  test('high returns VBR quality 0', () => {
    assert.deepEqual(getYtDlpAudioQualityArgs('high'), ['--audio-quality', '0']);
  });

  test('max returns 320K CBR', () => {
    assert.deepEqual(getYtDlpAudioQualityArgs('max'), ['--audio-quality', '320K']);
  });

  test('balanced returns quality 5', () => {
    assert.deepEqual(getYtDlpAudioQualityArgs('balanced'), ['--audio-quality', '5']);
  });
});

describe('validateAudioQualityPreset POST validation', () => {
  test('throws for empty string', () => {
    assert.throws(() => validateAudioQualityPreset(''), (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /required/);
      return true;
    });
  });

  test('throws for null', () => {
    assert.throws(() => validateAudioQualityPreset(null), (err) => {
      assert.equal(err.status, 400);
      return true;
    });
  });

  test('throws for unknown preset', () => {
    assert.throws(() => validateAudioQualityPreset('opus'), (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Unknown audioQualityPreset/);
      return true;
    });
  });

  test('accepts balanced', () => {
    assert.doesNotThrow(() => validateAudioQualityPreset('balanced'));
  });

  test('accepts high', () => {
    assert.doesNotThrow(() => validateAudioQualityPreset('high'));
  });

  test('accepts max', () => {
    assert.doesNotThrow(() => validateAudioQualityPreset('max'));
  });
});

describe('getAudioQualityPresetOptions', () => {
  test('returns array of 3 presets', () => {
    const opts = getAudioQualityPresetOptions();
    assert.equal(opts.length, 3);
  });

  test('each option has id, label, description only', () => {
    const opts = getAudioQualityPresetOptions();
    for (const opt of opts) {
      assert.ok(opt.id);
      assert.ok(opt.label);
      assert.ok(opt.description);
      assert.equal(opt.ytDlpAudioQuality, undefined);
    }
  });
});
