# Audio Format Support Implementation Plan

> **Status:** Planning document only. Do not implement until explicitly asked.
>
> **For Hermes:** When implementing, use Claude Code with the `claude-code` skill. For Settings UI work, invoke UI UX Pro Max and follow its React/accessibility guidance.

## Goal

Add user-selectable audio output formats to DownTune so downloads are no longer MP3-only. Keep MP3 as the compatibility option, then add modern/source-friendly formats for better quality and/or smaller files.

Recommended initial format set:

1. `mp3` — compatibility/default fallback, existing behavior.
2. `m4a` — best first non-MP3 option; broadly compatible and often close to YouTube's native AAC stream.
3. `opus` — best quality-per-size option; often closest to YouTube's native WebM/Opus stream.
4. `flac` — advanced/large-file option; does not restore quality beyond YouTube's lossy source, but avoids another lossy encode after conversion.

Defer initially:

- `wav` — huge, niche editing workflow.
- `aac` — prefer `m4a` container instead of raw AAC/ADTS.
- `vorbis` — prefer Opus.
- `alac` — niche Apple-lossless option; no real quality recovery from YouTube source.
- `best` — useful internally, but not stable enough for normal UI because resulting extension/codec can vary.

## Current state / constraints

DownTune currently has MP3-specific assumptions in several areas:

- `server/index.js`
  - Output filename is hardcoded to `.mp3`.
  - yt-dlp args hardcode `--audio-format mp3`.
  - MP3 quality presets are passed via `getYtDlpAudioQualityArgs(audioQualityPreset)`.
  - Metadata writing uses `NodeID3.Promise.write(...)`, which is MP3/ID3-oriented.

- `server/libraryManager.js`
  - Library scanning currently focuses on `.mp3` files.
  - Some basename/fallback logic strips `.mp3` specifically.

- `server/utils/audio-quality.js`
  - Presets are MP3-oriented:
    - `balanced` -> `--audio-quality 5`
    - `high` -> `--audio-quality 0`
    - `max` -> `--audio-quality 320K`

- `client/src/pages/Settings.jsx`
  - Settings UI currently exposes **MP3 Quality**, not a general format selector.

## Design principles

- Keep MP3 support working exactly as it does now.
- Do not remove the existing MP3 quality presets; make them conditional on MP3.
- Add a separate `audioFormat` setting instead of overloading `audioQualityPreset`.
- Use stable API/UI IDs, not raw yt-dlp strings in the frontend.
- Avoid exposing formats whose metadata/artwork behavior cannot be supported cleanly.
- Make the UI clear that YouTube source quality is already lossy:
  - M4A/Opus may preserve source-like quality better than MP3 transcoding.
  - FLAC does not create true lossless quality from YouTube.
- Do not run smoke downloads against the real library. Use `/tmp` only.
- Do not read or print `server/.env` secrets.
- Do not commit unless explicitly asked.

## Proposed config model

Public config field:

```js
audioFormat: 'mp3' | 'm4a' | 'opus' | 'flac'
```

Environment variable:

```env
AUDIO_FORMAT=mp3
```

Keep existing:

```env
AUDIO_QUALITY_PRESET=high
```

Behavior:

- `audioFormat` controls `yt-dlp --audio-format` and output extension.
- `audioQualityPreset` applies only when `audioFormat === 'mp3'`.
- For non-MP3 formats, omit MP3-specific `--audio-quality` unless a per-format preset model is added later.

## Recommended format definitions

Create a centralized helper such as `server/utils/audio-format.js`:

```js
export const DEFAULT_AUDIO_FORMAT = 'mp3';

export const AUDIO_FORMATS = Object.freeze({
  mp3: {
    id: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    ytDlpAudioFormat: 'mp3',
    description: 'Maximum compatibility. Uses MP3 quality presets.',
    supportsMp3QualityPreset: true,
  },
  m4a: {
    id: 'm4a',
    label: 'M4A / AAC',
    extension: 'm4a',
    ytDlpAudioFormat: 'm4a',
    description: 'Modern lossy format with broad device support. Often close to YouTube source audio.',
    supportsMp3QualityPreset: false,
  },
  opus: {
    id: 'opus',
    label: 'Opus',
    extension: 'opus',
    ytDlpAudioFormat: 'opus',
    description: 'Best quality per file size. Great for streaming, less universal for older devices.',
    supportsMp3QualityPreset: false,
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    extension: 'flac',
    ytDlpAudioFormat: 'flac',
    description: 'Large files. Does not restore quality beyond YouTube source, but avoids another lossy output.',
    supportsMp3QualityPreset: false,
    advanced: true,
  },
});
```

Helper exports:

- `DEFAULT_AUDIO_FORMAT`
- `AUDIO_FORMATS`
- `getAudioFormat(value = process.env.AUDIO_FORMAT)`
- `validateAudioFormat(value)`
- `getAudioFormatConfig(formatId)`
- `getAudioFormatOptions()` — frontend-safe `{ id, label, description, advanced }`
- `getAudioOutputExtension(formatId)`
- `getYtDlpAudioFormatArgs(formatId)` — returns `['--audio-format', config.ytDlpAudioFormat]`

## Task 1: Add backend audio-format helper

Files:

- Create: `server/utils/audio-format.js`
- Create: `server/test/audio-format.test.js`

Tests should cover:

- Missing value defaults to `mp3`.
- Valid formats: `mp3`, `m4a`, `opus`, `flac`.
- Invalid formats reject in validation mode.
- Values trim/lowercase correctly.
- Format options do not expose implementation internals unnecessarily.
- Output extensions map correctly.
- yt-dlp args map correctly:
  - `mp3` -> `['--audio-format', 'mp3']`
  - `m4a` -> `['--audio-format', 'm4a']`
  - `opus` -> `['--audio-format', 'opus']`
  - `flac` -> `['--audio-format', 'flac']`

Verification:

```bash
cd server && node --test test/audio-format.test.js
```

## Task 2: Wire selected format into download pipeline

Files:

- Modify: `server/index.js`

Implementation details:

1. Import audio-format helpers.
2. Read the selected format from config/env using `getAudioFormat()`.
3. Build the output filename with the selected extension instead of hardcoded `.mp3`.
4. Build yt-dlp args with the selected audio format.
5. Include MP3 quality args only for MP3.
6. Keep existing path containment checks around target folder/output path.
7. Log only non-secret format/preset IDs.

Target shape:

```js
const audioFormat = getAudioFormat();
const audioFormatConfig = getAudioFormatConfig(audioFormat);
const outputFilePath = path.join(targetFolderPath, `${safeTrackName}.${audioFormatConfig.extension}`);

const downloadArgs = [
  videoUrl,
  '-x',
  ...getYtDlpAudioFormatArgs(audioFormat),
  ...(audioFormatConfig.supportsMp3QualityPreset
    ? getYtDlpAudioQualityArgs(audioQualityPreset)
    : []),
  '--output', outputFilePath,
];
```

Important caveat:

- yt-dlp/ffmpeg may choose container-specific final extensions depending on format. Verify with isolated `/tmp` downloads before relying on filename assumptions.
- If yt-dlp ignores or rewrites the extension, use an output template plus post-download discovery instead of assuming the final path.

Verification:

```bash
node --check server/index.js
rg "audioFormat|AUDIO_FORMAT|--audio-format|getYtDlpAudioFormatArgs" server/index.js server/utils
```

## Task 3: Update `/config` GET/POST

Files:

- Modify: `server/index.js`

GET `/config` should return:

```js
audioFormat: getAudioFormat(config.audioFormat),
audioFormats: getAudioFormatOptions(),
audioQualityPreset,
audioQualityPresets,
```

POST `/config` should:

- Destructure `audioFormat` from `req.body`.
- Reject CR/LF via existing env newline guard.
- Validate with `validateAudioFormat`.
- Persist as `AUDIO_FORMAT=<format>` while preserving unrelated `.env` lines and Spotify secret behavior.
- Set `process.env.AUDIO_FORMAT = audioFormat` after write.
- Keep `AUDIO_QUALITY_PRESET` behavior unchanged.

Invalid formats should return HTTP 400.

Verification:

- Add tests if route-level config tests exist.
- At minimum run helper tests and server syntax check.

## Task 4: Update library scanning for multiple extensions

Files:

- Modify: `server/libraryManager.js`
- Add/modify tests if library tests exist.

Implementation details:

- Centralize supported audio extensions:

```js
const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.opus', '.flac']);
```

- Replace `.endsWith('.mp3')` checks with extension-based checks.
- Preserve safe path boundary checks already added.
- Update basename logic to strip any supported extension, not just `.mp3`.
- Ensure IDs/paths remain stable and safe.

Optional future extension support:

- If adding `.aac`, `.ogg`, `.wav`, `.alac` later, add them here only after metadata/artwork handling is understood.

Verification:

```bash
npm test --prefix server
```

Known baseline may still include the existing metadata cache-key failure unless fixed separately.

## Task 5: Metadata/artwork handling by format

Current issue:

- `NodeID3.Promise.write(tags, outputFilePath)` is suitable for MP3 ID3 tags, but not enough for M4A/Opus/FLAC.

Recommended first safe implementation:

1. Keep full ID3 tagging for MP3.
2. For non-MP3 formats, do not blindly call NodeID3.
3. Prefer yt-dlp/ffmpeg metadata embedding options if they work reliably:

```bash
--embed-metadata
--embed-thumbnail
--convert-thumbnails jpg
```

4. If custom metadata must be written after download, create a format-specific tagging abstraction:

```js
await writeAudioMetadata({ filePath, format: audioFormat, tags, artworkPath });
```

Potential implementations:

- MP3: current `node-id3`.
- M4A: ffmpeg metadata mapping or MP4 atom tooling.
- Opus/FLAC: Vorbis comments / ffmpeg metadata.

Initial acceptance can be:

- MP3 metadata remains unchanged.
- Non-MP3 downloads complete and appear in library.
- Non-MP3 metadata is at least not corrupted.
- If non-MP3 artwork embedding is deferred, the UI should still show artwork from app metadata/cache where possible.

## Task 6: Update Settings UI with UI UX Pro Max guidance

Files:

- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/css/Settings.css`

UI requirements:

- Add **Audio Format** in Settings → Downloads, above or near **MP3 Quality**.
- Use accessible radio cards or segmented cards.
- No placeholder-only labels.
- Visible focus states.
- Match existing glass/frosted UI style.
- Avoid emojis.
- Make mobile layout wrap/stack cleanly.
- Keep **MP3 Quality** visible only when `audioFormat === 'mp3'`, or clearly disabled with text explaining it only applies to MP3.

Suggested copy:

- MP3: “Best compatibility. Uses the MP3 quality setting below.”
- M4A: “Modern lossy format with broad support. Often closer to YouTube source audio.”
- Opus: “Best quality per file size. Great for streaming; older devices may not support it.”
- FLAC: “Large files. Does not restore YouTube source quality, but avoids another lossy output.”

State shape:

```js
const [audioFormat, setAudioFormat] = useState('mp3');
const [audioFormats, setAudioFormats] = useState([]);
```

Config load:

```js
if (data.audioFormat) setAudioFormat(data.audioFormat);
if (Array.isArray(data.audioFormats)) setAudioFormats(data.audioFormats);
```

Save body:

```js
body: {
  clientId,
  clientSecret,
  downloadPath,
  searchProvider,
  audioFormat,
  audioQualityPreset,
}
```

Validation UX:

- If Opus/FLAC selected, show note that compatibility/filesize differs.
- If MP3 selected, show existing MP3 quality cards.
- Do not expose raw yt-dlp terms like `ba`, `webm`, or codec internals in normal UI.

Verification:

```bash
npm run lint --prefix client
npm run build --prefix client
```

## Task 7: Isolated download smoke tests

Do not use the real configured library.

Use `/tmp` only:

```bash
rm -rf /tmp/downtune-format-smoke
mkdir -p /tmp/downtune-format-smoke
```

Direct yt-dlp/ffmpeg smoke examples:

```bash
python3 -m yt_dlp "$TEST_URL" -x --audio-format m4a  --output '/tmp/downtune-format-smoke/test-m4a.%(ext)s' --no-playlist
python3 -m yt_dlp "$TEST_URL" -x --audio-format opus --output '/tmp/downtune-format-smoke/test-opus.%(ext)s' --no-playlist
python3 -m yt_dlp "$TEST_URL" -x --audio-format flac --output '/tmp/downtune-format-smoke/test-flac.%(ext)s' --no-playlist
```

Inspect outputs:

```bash
ffprobe -v error -show_entries format=format_name,bit_rate,size,duration -show_entries stream=codec_name,bit_rate,sample_rate,channels -of json /tmp/downtune-format-smoke/<file>
```

Optional app-route smoke:

- Start backend with isolated `DOWNLOAD_PATH=/tmp/downtune-format-smoke-library`.
- Use a safe test URL/query.
- POST one download per format only if explicitly approved for a mutating smoke.

## Acceptance criteria

- `audioFormat` is exposed by `/config` GET and persisted by `/config` POST.
- Supported formats are validated server-side; invalid values return HTTP 400.
- Downloads use selected `--audio-format`.
- Output filenames are no longer hardcoded to `.mp3`.
- MP3 quality presets still apply to MP3 downloads.
- MP3 quality presets are hidden or marked MP3-only for non-MP3 formats.
- Library scanner includes at least `.mp3`, `.m4a`, `.opus`, `.flac`.
- Non-MP3 files do not get corrupted by MP3-only metadata writing.
- Client lint/build pass.
- Server audio-format tests pass.
- Full server tests have no new failures beyond known baseline, if that baseline still exists.

## Claude implementation prompt

Use this task framing when implementation is approved:

```text
Use UI UX Pro Max for the Settings UI portion. Implement the plan in audio-format-support-plan.md. Preserve all existing uncommitted changes; do not commit. Do not read, print, or expose server/.env secrets. Add user-selectable audio formats while keeping MP3 and the existing MP3 quality presets working. Initial formats: mp3, m4a, opus, flac. Add backend audio-format helper/tests, wire selected format into yt-dlp args and output extension, expose/persist audioFormat through /config, update library scanning for supported extensions, make metadata writing safe for non-MP3 formats, and add an accessible Settings > Downloads Audio Format UI. Run npm run lint --prefix client, npm run build --prefix client, focused server tests, and npm test --prefix server. Do not run downloads against the real library; use /tmp only if a smoke is needed and report any known baseline failures separately.
```
