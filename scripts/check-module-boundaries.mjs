// 新增的模板/练习规则保持纯函数；界面和 IPC 只在调用方编排。
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function checkModuleBoundaries(overrides = {}) {
  const issues = [];
  const graph = new Map();
  const visiting = new Set();
  const visited = new Set();
  const source = file => overrides[file] ?? readFileSync(resolve(root, file), 'utf8');
  function inspect(file) {
    if (graph.has(file)) return;
    graph.set(file, []);
    const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      if (node.importClause?.isTypeOnly) continue;
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named) && named.elements.every(item => item.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text;
      if (/^(react|next|zustand|@tauri-apps)(\/|$)/.test(specifier) || /^@\/(components|pages|stores|hooks)\//.test(specifier)) {
        issues.push(`${file}: 纯规则不得依赖界面、状态或 IPC (${specifier})`);
        continue;
      }
      const base = specifier.startsWith('@/') ? resolve(root, 'src', specifier.slice(2)) : specifier.startsWith('.') ? resolve(root, dirname(file), specifier) : null;
      if (!base) continue;
      const target = [`${base}.ts`, `${base}.tsx`, base].find(path => existsSync(path));
      if (!target) { issues.push(`${file}: 导入不存在 (${specifier})`); continue; }
      const local = relative(root, target);
      graph.get(file).push(local);
      inspect(local);
    }
  }
  function visit(file) {
    if (visiting.has(file)) { issues.push(`${file}: 纯规则存在运行时循环依赖`); return; }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) || []) visit(dependency);
    visiting.delete(file); visited.add(file);
  }
  for (const file of ['src/lib/resume-template.ts', 'src/lib/interview-practice.ts', 'src/lib/work-notes.ts']) inspect(file);
  for (const file of graph.keys()) visit(file);
  return issues;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = checkModuleBoundaries();
  if (issues.length) { process.stderr.write(issues.join('\n') + '\n'); process.exitCode = 1; }
  else process.stdout.write('PASS 模板与练习规则：纯函数、依赖方向与运行时循环检查\n');
}
