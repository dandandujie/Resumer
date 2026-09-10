import assert from 'node:assert/strict';
import { classifyAiError, formatDiagnostics, hostOf } from '../src/lib/ai-error';

assert.equal(classifyAiError('401 {"error":{"message":"Incorrect API key provided"}}'), 'auth');
assert.equal(classifyAiError('429 insufficient_quota: You exceeded your current quota'), 'quota');
assert.equal(classifyAiError('429 Rate limit reached for gpt-4o'), 'rate_limit');
assert.equal(classifyAiError('404 The model `gpt-5-ultra` does not exist'), 'model_missing');
assert.equal(classifyAiError('400 tool_choice is not supported by this model'), 'tools_unsupported');
assert.equal(classifyAiError("This model's maximum context length is 8192 tokens"), 'context_length');
assert.equal(classifyAiError('error sending request for url (https://api.openai.com/v1/chat/completions)'), 'network');
assert.equal(classifyAiError('502 Bad Gateway'), 'server');
assert.equal(classifyAiError('CHROME_NOT_FOUND: no Chromium-family browser found'), 'chrome_missing');
assert.equal(classifyAiError('something odd'), 'unknown');

assert.equal(hostOf('https://api.deepseek.com/v1'), 'api.deepseek.com');
assert.equal(hostOf('not a url'), '(invalid url)');
const text = formatDiagnostics({
  time: 't', appVersion: '0.7.0', platform: 'MacIntel', provider: 'openai', baseUrlHost: 'api.x.com',
  model: 'm', webSearchMode: 'off', error: 'sk-should-not-appear? no: error text only',
});
assert.ok(text.includes('provider: openai') && text.includes('baseUrl: api.x.com'));
console.log('ai-error: 13 assertions passed');
