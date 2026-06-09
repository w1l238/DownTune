const AUDIO_QUALITY_PRESETS = Object.freeze({
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Current behavior: yt-dlp/ffmpeg default quality. Smaller files, usually around 130–140 kb/s.',
    ytDlpAudioQuality: '5',
  },
  high: {
    id: 'high',
    label: 'High Quality VBR',
    description: 'Recommended MP3 default. Uses VBR quality 0 for better MP3 transcodes.',
    ytDlpAudioQuality: '0',
  },
  max: {
    id: 'max',
    label: '320 kb/s CBR',
    description: 'Forces 320K MP3 output. Larger files; cannot improve beyond YouTube source quality.',
    ytDlpAudioQuality: '320K',
  },
});

const DEFAULT_AUDIO_QUALITY_PRESET = 'high';

const getAudioQualityPreset = (value = process.env.AUDIO_QUALITY_PRESET) => {
  if (!value) return DEFAULT_AUDIO_QUALITY_PRESET;
  const normalized = String(value).trim().toLowerCase();
  return AUDIO_QUALITY_PRESETS[normalized] ? normalized : DEFAULT_AUDIO_QUALITY_PRESET;
};

const validateAudioQualityPreset = (value) => {
  if (!value) {
    const err = new Error('audioQualityPreset is required.');
    err.status = 400;
    throw err;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!AUDIO_QUALITY_PRESETS[normalized]) {
    const err = new Error(
      `Unknown audioQualityPreset: "${value}". Valid values: ${Object.keys(AUDIO_QUALITY_PRESETS).join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return normalized;
};

const getYtDlpAudioQualityArgs = (presetId = getAudioQualityPreset()) => {
  const preset = AUDIO_QUALITY_PRESETS[presetId] || AUDIO_QUALITY_PRESETS[DEFAULT_AUDIO_QUALITY_PRESET];
  return ['--audio-quality', preset.ytDlpAudioQuality];
};

const getAudioQualityPresetOptions = () =>
  Object.values(AUDIO_QUALITY_PRESETS).map(({ id, label, description }) => ({ id, label, description }));

export {
  DEFAULT_AUDIO_QUALITY_PRESET,
  AUDIO_QUALITY_PRESETS,
  getAudioQualityPreset,
  validateAudioQualityPreset,
  getYtDlpAudioQualityArgs,
  getAudioQualityPresetOptions,
};
