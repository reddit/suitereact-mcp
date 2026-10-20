import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

export function loadModule(file, dependencies = {}, globals = {}) {
  const source = readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const exports = {};
  runInNewContext(
    outputText,
    {
      ...globals,
      exports,
      module: { exports },
      require(name) {
        assert.ok(
          Object.hasOwn(dependencies, name),
          `Unexpected import: ${name}`
        );
        return dependencies[name];
      },
    },
    { filename: file }
  );
  return exports;
}
