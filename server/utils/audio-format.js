const AUDIO_FORMATS = Object.freeze({
  mp3: {
    id: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    ytDlpAudioFormat: 'mp3',
    description: 'Best compatibility. Uses the MP3 quality setting below.',
    supportsMp3QualityPreset: true,
  },
  m4a: {
    id: 'm4a',
    label: 'M4A / AAC',
    extension: 'm4a',
    ytDlpAudioFormat: 'm4a',
    description: 'Modern lossy format with broad support. Often closer to YouTube source audio.',
    supportsMp3QualityPreset: false,
  },
  opus: {
    id: 'opus',
    label: 'Opus',
    extension: 'opus',
    ytDlpAudioFormat: 'opus',
    description: 'Best quality per file size. Great for streaming; older devices may not support it.',
    supportsMp3QualityPreset: false,
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    extension: 'flac',
    ytDlpAudioFormat: 'flac',
    description: 'Large files. Does not restore YouTube source quality, but avoids another lossy output.',
    supportsMp3QualityPreset: false,
    advanced: true,
  },
});

const DEFAULT_AUDIO_FORMAT = 'mp3';

const getAudioFormat = (value = process.env.AUDIO_FORMAT) => {
  if (!value) return DEFAULT_AUDIO_FORMAT;
  const normalized = String(value).trim().toLowerCase();
  return AUDIO_FORMATS[normalized] ? normalized : DEFAULT_AUDIO_FORMAT;
};

const validateAudioFormat = (value) => {
  if (!value) {
    const err = new Error('audioFormat is required.');
    err.status = 400;
    throw err;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!AUDIO_FORMATS[normalized]) {
    const err = new Error(
      `Unknown audioFormat: "${value}". Valid values: ${Object.keys(AUDIO_FORMATS).join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return normalized;
};

const getAudioFormatConfig = (formatId) =>
  AUDIO_FORMATS[formatId] || AUDIO_FORMATS[DEFAULT_AUDIO_FORMAT];

const getAudioFormatOptions = () =>
  Object.values(AUDIO_FORMATS).map(({ id, label, description, supportsMp3QualityPreset, advanced }) => ({
    id,
    label,
    description,
    supportsMp3QualityPreset,
    ...(advanced ? { advanced: true } : {}),
  }));

const getAudioOutputExtension = (formatId) =>
  getAudioFormatConfig(formatId).extension;

const getYtDlpAudioFormatArgs = (formatId) => {
  const config = getAudioFormatConfig(formatId);
  return ['--audio-format', config.ytDlpAudioFormat];
};

export {
  DEFAULT_AUDIO_FORMAT,
  AUDIO_FORMATS,
  getAudioFormat,
  validateAudioFormat,
  getAudioFormatConfig,
  getAudioFormatOptions,
  getAudioOutputExtension,
  getYtDlpAudioFormatArgs,
};
