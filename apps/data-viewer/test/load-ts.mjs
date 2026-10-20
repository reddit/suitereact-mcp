import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

export function loadTs(path, mocks = {}, env = { DEV: true }) {
  const file = resolve(path);
  const source = readFileSync(file, 'utf8').replaceAll(
    'import.meta.env',
    JSON.stringify(env)
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
  });
  const module = { exports: {} };
  const require = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.'))
      return loadTs(resolve(dirname(file), `${name}.ts`), mocks, env);
    return createRequire(file)(name);
  };
  new Function('require', 'exports', 'module', outputText)(
    require,
    module.exports,
    module
  );
  return module.exports;
}
