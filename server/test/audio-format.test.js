import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUDIO_FORMAT,
  getAudioFormat,
  validateAudioFormat,
  getAudioFormatConfig,
  getAudioFormatOptions,
  getAudioOutputExtension,
  getYtDlpAudioFormatArgs,
} from '../utils/audio-format.js';

describe('audio-format defaults', () => {
  test('DEFAULT_AUDIO_FORMAT is mp3', () => {
    assert.equal(DEFAULT_AUDIO_FORMAT, 'mp3');
  });

  test('missing value returns mp3', () => {
    assert.equal(getAudioFormat(undefined), 'mp3');
  });

  test('empty string returns mp3', () => {
    assert.equal(getAudioFormat(''), 'mp3');
  });

  test('null returns mp3', () => {
    assert.equal(getAudioFormat(null), 'mp3');
  });

  test('unknown value returns mp3', () => {
    assert.equal(getAudioFormat('garbage'), 'mp3');
    assert.equal(getAudioFormat('wav'), 'mp3');
    assert.equal(getAudioFormat('aac'), 'mp3');
  });
});

describe('audio-format known formats', () => {
  test('mp3 is valid', () => {
    assert.equal(getAudioFormat('mp3'), 'mp3');
  });

  test('m4a is valid', () => {
    assert.equal(getAudioFormat('m4a'), 'm4a');
  });

  test('opus is valid', () => {
    assert.equal(getAudioFormat('opus'), 'opus');
  });

  test('flac is valid', () => {
    assert.equal(getAudioFormat('flac'), 'flac');
  });

  test('format lookup is case-insensitive and trims whitespace', () => {
    assert.equal(getAudioFormat('MP3'), 'mp3');
    assert.equal(getAudioFormat('M4A'), 'm4a');
    assert.equal(getAudioFormat('OPUS'), 'opus');
    assert.equal(getAudioFormat('FLAC'), 'flac');
    assert.equal(getAudioFormat('  mp3  '), 'mp3');
  });
});

describe('getAudioFormatConfig', () => {
  test('mp3 config has supportsMp3QualityPreset true', () => {
    const config = getAudioFormatConfig('mp3');
    assert.equal(config.supportsMp3QualityPreset, true);
  });

  test('m4a config has supportsMp3QualityPreset false', () => {
    assert.equal(getAudioFormatConfig('m4a').supportsMp3QualityPreset, false);
  });

  test('opus config has supportsMp3QualityPreset false', () => {
    assert.equal(getAudioFormatConfig('opus').supportsMp3QualityPreset, false);
  });

  test('flac config has supportsMp3QualityPreset false', () => {
    assert.equal(getAudioFormatConfig('flac').supportsMp3QualityPreset, false);
  });

  test('unknown format falls back to mp3 config', () => {
    const config = getAudioFormatConfig('wav');
    assert.equal(config.id, 'mp3');
  });
});

describe('getAudioOutputExtension', () => {
  test('mp3 -> mp3', () => {
    assert.equal(getAudioOutputExtension('mp3'), 'mp3');
  });

  test('m4a -> m4a', () => {
    assert.equal(getAudioOutputExtension('m4a'), 'm4a');
  });

  test('opus -> opus', () => {
    assert.equal(getAudioOutputExtension('opus'), 'opus');
  });

  test('flac -> flac', () => {
    assert.equal(getAudioOutputExtension('flac'), 'flac');
  });
});

describe('getYtDlpAudioFormatArgs', () => {
  test('mp3 -> [--audio-format, mp3]', () => {
    assert.deepEqual(getYtDlpAudioFormatArgs('mp3'), ['--audio-format', 'mp3']);
  });

  test('m4a -> [--audio-format, m4a]', () => {
    assert.deepEqual(getYtDlpAudioFormatArgs('m4a'), ['--audio-format', 'm4a']);
  });

  test('opus -> [--audio-format, opus]', () => {
    assert.deepEqual(getYtDlpAudioFormatArgs('opus'), ['--audio-format', 'opus']);
  });

  test('flac -> [--audio-format, flac]', () => {
    assert.deepEqual(getYtDlpAudioFormatArgs('flac'), ['--audio-format', 'flac']);
  });
});

describe('validateAudioFormat POST validation', () => {
  test('throws for empty string', () => {
    assert.throws(() => validateAudioFormat(''), (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /required/);
      return true;
    });
  });

  test('throws for null', () => {
    assert.throws(() => validateAudioFormat(null), (err) => {
      assert.equal(err.status, 400);
      return true;
    });
  });

  test('throws for unknown format', () => {
    assert.throws(() => validateAudioFormat('wav'), (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Unknown audioFormat/);
      return true;
    });
  });

  test('accepts mp3', () => {
    assert.doesNotThrow(() => validateAudioFormat('mp3'));
  });

  test('accepts m4a', () => {
    assert.doesNotThrow(() => validateAudioFormat('m4a'));
  });

  test('accepts opus', () => {
    assert.doesNotThrow(() => validateAudioFormat('opus'));
  });

  test('accepts flac', () => {
    assert.doesNotThrow(() => validateAudioFormat('flac'));
  });
});

describe('getAudioFormatOptions', () => {
  test('returns array of 4 formats', () => {
    const opts = getAudioFormatOptions();
    assert.equal(opts.length, 4);
  });

  test('each option has id, label, description, supportsMp3QualityPreset', () => {
    const opts = getAudioFormatOptions();
    for (const opt of opts) {
      assert.ok(opt.id);
      assert.ok(opt.label);
      assert.ok(opt.description);
      assert.ok('supportsMp3QualityPreset' in opt);
      assert.equal(opt.ytDlpAudioFormat, undefined, 'ytDlpAudioFormat should not be exposed');
      assert.equal(opt.extension, undefined, 'extension should not be exposed');
    }
  });

  test('only mp3 has supportsMp3QualityPreset true', () => {
    const opts = getAudioFormatOptions();
    const mp3 = opts.find(o => o.id === 'mp3');
    assert.equal(mp3.supportsMp3QualityPreset, true);
    for (const opt of opts.filter(o => o.id !== 'mp3')) {
      assert.equal(opt.supportsMp3QualityPreset, false);
    }
  });

  test('flac is marked advanced', () => {
    const opts = getAudioFormatOptions();
    const flac = opts.find(o => o.id === 'flac');
    assert.equal(flac.advanced, true);
  });
});
