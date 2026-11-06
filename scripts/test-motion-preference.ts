import assert from 'node:assert/strict';
import { appScrollBehavior } from '../src/lib/motion';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  Reflect.deleteProperty(globalThis, 'window');
  assert.equal(appScrollBehavior(), 'instant');
  let reduce = false;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia: (query: string) => {
      assert.equal(query, '(prefers-reduced-motion: no-preference)');
      return { matches: !reduce };
    },
  } });
  assert.equal(appScrollBehavior(), 'smooth');
  reduce = true;
  assert.equal(appScrollBehavior(), 'instant');
  reduce = false;
  assert.equal(appScrollBehavior(), 'smooth');
  console.log('PASS motion follows the current system preference');
} finally {
  if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
  else Reflect.deleteProperty(globalThis, 'window');
}
