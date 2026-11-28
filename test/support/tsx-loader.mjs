// Låter testerna importera appens .ts/.tsx-komponenter direkt: TypeScript översätter dem
// i minnet (samma JSX-inställning som Next), och importer utan filändelse hittas.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const EXT = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    if (!existsSync(base) || !/\.[cm]?[jt]sx?$|\.json$/.test(base)) {
      for (const ext of EXT) {
        if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (/\.tsx?$/.test(url)) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  if (url.endsWith('.json')) {
    const r = await next(url, { ...context, importAttributes: { type: 'json' } });
    return r;
  }
  return next(url, context);
}
