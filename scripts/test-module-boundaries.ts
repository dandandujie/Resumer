import assert from 'node:assert/strict';
import { checkModuleBoundaries } from './check-module-boundaries.mjs';
assert.deepEqual(checkModuleBoundaries(), []);
assert.ok(checkModuleBoundaries({'src/lib/resume-template.ts': "import { useResumeStore } from '@/stores/resume-store';"}).some(s => s.includes('不得依赖')));
assert.ok(checkModuleBoundaries({'src/lib/resume-template.ts': "import { invoke } from '@tauri-apps/api/core';"}).some(s => s.includes('不得依赖')));
assert.deepEqual(checkModuleBoundaries({'src/lib/resume-template.ts': "import type { Resume } from '@/types/resume';"}), []);
console.log('PASS 新模块规则依赖守卫与负例');
