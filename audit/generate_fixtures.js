const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const fixturesDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

console.log('Generating test fixtures in', fixturesDir);

// 1. Generate speech audio if not already generated
const speechMp3 = path.join(fixturesDir, 'speech.mp3');
if (!fs.existsSync(speechMp3)) {
  console.log('Generating speech.mp3 via edge-tts...');
  execSync('edge-tts --text "Hello and welcome to AI Dubbing Studio automated audit. This is a synthetic test audio file." --voice en-US-ChristopherNeural --write-media "' + speechMp3 + '"');
}

// 2. Generate 10-second BGM mp3 (a soft chord/sine wave arpeggio)
const bgmMp3 = path.join(fixturesDir, 'bgm.mp3');
console.log('Generating bgm.mp3 via ffmpeg...');
execSync(`"${ffmpegPath}" -y -f lavfi -i "sine=frequency=440:duration=10" -af "volume=0.2" -c:a libmp3lame -b:a 128k "${bgmMp3}"`, { stdio: 'pipe' });

// 3. Generate 10-second MP4 test video with the speech audio and a color test pattern / timer overlay
const testVideoMp4 = path.join(fixturesDir, 'test_video.mp4');
console.log('Generating test_video.mp4 via ffmpeg...');
// We create a 10-second 1280x720 video at 30fps with testsrc and mix in speech.mp3
execSync(`"${ffmpegPath}" -y -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -i "${speechMp3}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${testVideoMp4}"`, { stdio: 'pipe' });

// 4. Generate sample SRT file
const sampleSrt = path.join(fixturesDir, 'sample.srt');
const srtContent = `1
00:00:01,000 --> 00:00:04,500
Hello and welcome to AI Dubbing Studio automated audit.

2
00:00:05,000 --> 00:00:08,800
This is a synthetic test audio file for verification.
`;
fs.writeFileSync(sampleSrt, srtContent, 'utf8');

// 5. Generate sample VTT file
const sampleVtt = path.join(fixturesDir, 'sample.vtt');
const vttContent = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
Hello and welcome to AI Dubbing Studio automated audit.

2
00:00:05.000 --> 00:00:08.800
This is a synthetic test audio file for verification.
`;
fs.writeFileSync(sampleVtt, vttContent, 'utf8');

console.log('Fixtures generated successfully:');
console.log('- speech.mp3:', fs.statSync(speechMp3).size, 'bytes');
console.log('- bgm.mp3:', fs.statSync(bgmMp3).size, 'bytes');
console.log('- test_video.mp4:', fs.statSync(testVideoMp4).size, 'bytes');
console.log('- sample.srt:', fs.statSync(sampleSrt).size, 'bytes');
console.log('- sample.vtt:', fs.statSync(sampleVtt).size, 'bytes');
