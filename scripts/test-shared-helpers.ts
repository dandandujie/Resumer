import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createListEditor } from '../src/lib/list-editor';
import { isValidQrUrl } from '../src/lib/qrcode';

test('list editor adds, updates, and removes without mutating the source', () => {
  const source = [{ name: 'first' }, { name: 'second' }];
  let result = source;
  const onChange = (items: typeof source) => { result = items; };

  createListEditor(source, onChange, () => ({ name: 'third' })).addItem();
  assert.deepEqual(result, [...source, { name: 'third' }]);

  createListEditor(source, onChange, () => ({ name: '' })).updateItem(1, { name: 'updated' });
  assert.deepEqual(result, [{ name: 'first' }, { name: 'updated' }]);

  createListEditor(source, onChange, () => ({ name: '' })).removeItem(0);
  assert.deepEqual(result, [{ name: 'second' }]);
  assert.deepEqual(source, [{ name: 'first' }, { name: 'second' }]);
});

test('QR URL validation accepts web hosts and rejects empty or unsupported URLs', () => {
  assert.equal(isValidQrUrl('example.com'), true);
  assert.equal(isValidQrUrl('http://localhost'), true);
  assert.equal(isValidQrUrl(''), false);
  assert.equal(isValidQrUrl('ftp://example.com'), false);
  assert.equal(isValidQrUrl('not-a-host'), false);
});
