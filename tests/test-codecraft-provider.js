const assert = require('assert');
const settingsService = require('../src/main/services/settings');
const { DEFAULT_SETTINGS } = settingsService;
const translationService = require('../src/main/services/providers/translation');
const asrService = require('../src/main/services/providers/asr');
const CodecraftTranslationProvider = require('../src/main/services/providers/translation/codecraft');
const CodecraftAsrProvider = require('../src/main/services/providers/asr/codecraft');

async function run() {
  console.log('Testing CodeCraft settings and provider integration...');

  // 1. Settings Schema
  assert(DEFAULT_SETTINGS.codecraft, 'DEFAULT_SETTINGS must have codecraft configuration');
  assert.strictEqual(DEFAULT_SETTINGS.codecraft.baseUrl, 'https://codecraftapi.com/v1');
  assert.strictEqual(DEFAULT_SETTINGS.codecraft.translationModel, 'claude-3-7-sonnet-20250219');
  assert.strictEqual(DEFAULT_SETTINGS.codecraft.asrModel, 'whisper-1');
  console.log('✓ CodeCraft default settings verified');

  // 2. Translation Provider Registration
  const transProvider = translationService.getProvider('codecraft');
  assert(transProvider, 'Translation service must register codecraft provider');
  assert(transProvider instanceof CodecraftTranslationProvider, 'Must be instance of CodecraftTranslationProvider');
  assert.strictEqual(typeof transProvider.translate, 'function');
  assert.strictEqual(typeof transProvider.condense, 'function');
  assert.strictEqual(typeof transProvider.cancel, 'function');
  console.log('✓ CodeCraft translation provider registration verified');

  // 3. ASR Provider Registration
  const asrProvider = asrService.providers['codecraft'];
  assert(asrProvider, 'ASR service must register codecraft provider');
  assert(asrProvider instanceof CodecraftAsrProvider, 'Must be instance of CodecraftAsrProvider');
  assert.strictEqual(typeof asrProvider.transcribe, 'function');
  assert.strictEqual(typeof asrProvider.cancel, 'function');
  console.log('✓ CodeCraft ASR provider registration verified');

  // 4. Missing API key validation
  try {
    await transProvider.translate(['Hello'], { apiKey: '' });
    assert.fail('Should fail without API key');
  } catch (err) {
    assert(err.message.includes('CodeCraft API Key') || err.message.includes('API key'), `Expected API key error message, got: ${err.message}`);
    console.log('✓ Translation API key validation verified');
  }

  try {
    await asrProvider.transcribe('nonexistent.wav', { apiKey: '' });
    assert.fail('Should fail without API key');
  } catch (err) {
    assert(err.message.includes('CodeCraft API Key') || err.message.includes('API key'), `Expected API key error message, got: ${err.message}`);
    console.log('✓ ASR API key validation verified');
  }

  // 5. Condense empty input
  const emptyCondensed = await transProvider.condense([], { apiKey: 'dummy' });
  assert(Array.isArray(emptyCondensed) && emptyCondensed.length === 0, 'Empty input should yield empty array');
  console.log('✓ Empty condense validation verified');

  // 6. Test connection with mocked fetch
  const originalFetch = global.fetch;

  try {
    // 6a. Success case
    global.fetch = async (url, options) => {
      assert(url.includes('/models') || url.includes('/chat/completions'));
      assert(options.headers.Authorization.includes('test-key'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'claude-3-7-sonnet-20250219' }, { id: 'whisper-1' }]
        })
      };
    };

    const resSuccess = await (async () => {
      const response = await global.fetch('https://codecraftapi.com/v1/models', {
        headers: { Authorization: 'Bearer test-key' }
      });
      const data = await response.json();
      return { ok: true, models: data.data.map(m => m.id) };
    })();

    assert.strictEqual(resSuccess.ok, true);
    assert(resSuccess.models.includes('claude-3-7-sonnet-20250219'));
    console.log('✓ Mock connection test (success) verified');

    // 6b. Unauthorized case (401)
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API key provided' }
        })
      };
    };

    const resFail = await (async () => {
      const response = await global.fetch('https://codecraftapi.com/v1/models', {
        headers: { Authorization: 'Bearer invalid-key' }
      });
      if (!response.ok) {
        const errJson = await response.json();
        return { ok: false, error: errJson.error.message };
      }
      return { ok: true };
    })();

    assert.strictEqual(resFail.ok, false);
    assert.strictEqual(resFail.error, 'Invalid API key provided');
    console.log('✓ Mock connection test (unauthorized) verified');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('All CodeCraft tests passed successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
