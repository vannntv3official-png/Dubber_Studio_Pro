/**
 * Gemini Speaker Voice Detection & Classification
 * Classifies dialogue audio slices into female / male / unknown based on acoustic pitch & timbre.
 */

const fs = require('fs');
const keyPool = require('../../key-pool');
const logger = require('../../../utils/logger');

const CLASSIFICATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          vocalType: { type: 'STRING', enum: ['female', 'male', 'unknown'] }
        },
        required: ['id', 'vocalType']
      }
    }
  },
  required: ['lines']
};

function buildClassificationPrompt(clipDurationSec, ranges) {
  return `Listen to this audio clip and classify the voice speaking in each listed time range.
This clip is exactly ${clipDurationSec.toFixed(1)} seconds long; the ranges are decimal seconds measured from the start of this clip.
For every id, set vocalType to female or male from the sound of the voice heard inside that range - judge by pitch and timbre, never by the words or the topic.
Use unknown rather than guessing for processed, child, androgynous, overlapping, or unclear voices, or when no one speaks in the range.
Return exactly one output for every id.
Ranges JSON:
${JSON.stringify(ranges)}`;
}

class SpeakerDetectionService {
  /**
   * Classify speaker gender for a list of cue segments
   */
  async detectVoices(audioWavPath, segments = [], options = {}) {
    if (!Array.isArray(segments) || segments.length === 0) {
      return segments;
    }
    if (!fs.existsSync(audioWavPath)) {
      logger.warn(`Speaker detection skipped: Audio file missing at ${audioWavPath}`);
      return segments;
    }

    try {
      const apiKey = keyPool.getNextKey();
      const model = (options.model || 'gemini-3.8-flash').replace(/^models\//, '');
      const audioBuffer = fs.readFileSync(audioWavPath);
      const audioBase64 = audioBuffer.toString('base64');

      // Prepare time ranges
      const ranges = segments.map(s => ({
        id: String(s.id),
        start: s.startMs ? s.startMs / 1000 : (s.start || 0),
        end: s.endMs ? s.endMs / 1000 : (s.end || 0)
      }));

      const maxEnd = Math.max(...ranges.map(r => r.end), 1);
      const prompt = buildClassificationPrompt(maxEnd, ranges);

      const isMp3 = audioWavPath.toLowerCase().endsWith('.mp3');
      const mimeType = isMp3 ? 'audio/mp3' : 'audio/wav';

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: audioBase64 } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: CLASSIFICATION_SCHEMA,
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {})
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        logger.warn(`Speaker classification returned HTTP ${response.status}`);
        return segments;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
      if (!rawText) return segments;

      const parsed = JSON.parse(rawText);
      const resultMap = new Map((parsed.lines || []).map(l => [String(l.id), l.vocalType]));

      return segments.map(seg => {
        const detected = resultMap.get(String(seg.id));
        if (detected === 'female' || detected === 'male') {
          return { ...seg, vocalType: detected, gender: detected === 'female' ? 'F' : 'M' };
        }
        return seg;
      });
    } catch (err) {
      logger.warn(`Speaker detection error: ${err.message}`);
      return segments;
    }
  }
}

const speakerDetectionService = new SpeakerDetectionService();
module.exports = speakerDetectionService;
