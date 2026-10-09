import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(projectRoot, 'package.json'));
const ts = require('typescript');
const kinds = { buttons: 'button', modals: 'modal', selectMenus: 'select' };

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function source(path) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

function referencedTests() {
  const references = new Map();
  for (const path of filesIn(join(projectRoot, 'tests')).filter((p) => p.endsWith('.test.ts'))) {
    for (const statement of source(path).statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      const imported = resolve(dirname(path), statement.moduleSpecifier.text) + '.ts';
      const tests = references.get(imported) ?? [];
      tests.push(relative(projectRoot, path).replaceAll('\\', '/'));
      references.set(imported, tests);
    }
  }
  return references;
}

export function componentInventory() {
  const tests = referencedTests();
  const components = [];
  for (const [directory, kind] of Object.entries(kinds)) {
    for (const path of filesIn(join(projectRoot, 'src/interactions', directory)).filter((p) =>
      p.endsWith('.ts'),
    )) {
      const tree = source(path);
      const keys = {};
      let execute = false;
      for (const statement of tree.statements) {
        const exported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported) continue;
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'execute')
          execute = true;
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
          const key = declaration.name.text;
          if (
            (key === 'customId' || key === 'customIdPrefix') &&
            ts.isStringLiteral(declaration.initializer)
          ) {
            keys[key] = declaration.initializer.text;
          }
        }
      }
      components.push({
        kind,
        id: keys.customId ?? keys.customIdPrefix ?? null,
        match: keys.customId ? 'exact' : keys.customIdPrefix ? 'prefix' : 'invalid',
        file: relative(projectRoot, path).replaceAll('\\', '/'),
        validExport: execute && Object.keys(keys).length === 1,
        scenarioTestReferences: tests.get(path) ?? [],
        coverage:
          'Registry contracts are tested for every module; references do not prove branch coverage. Live clicks remain unverified.',
      });
    }
  }
  return components.sort((a, b) => a.file.localeCompare(b.file));
}

export function resolveInventoryComponent(customId, kind, components = componentInventory()) {
  const candidates = components.filter((c) => c.kind === kind);
  return (
    candidates.find((c) => c.match === 'exact' && c.id === customId) ??
    candidates
      .filter((c) => c.match === 'prefix' && customId.startsWith(c.id))
      .sort((a, b) => b.id.length - a.id.length)[0] ??
    null
  );
}

export function inlineControls() {
  const controls = [];
  for (const path of filesIn(join(projectRoot, 'src')).filter((p) => p.endsWith('.ts'))) {
    const tree = source(path);
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'setCustomId' &&
        node.arguments.length === 1
      ) {
        const value = node.arguments[0];
        const id = ts.isStringLiteral(value)
          ? value.text
          : ts.isNoSubstitutionTemplateLiteral(value)
            ? value.text
            : ts.isTemplateExpression(value)
              ? value.head.text + '{dynamic}'
              : '{expression}';
        let builder = node.expression.expression;
        while (ts.isCallExpression(builder) && ts.isPropertyAccessExpression(builder.expression)) {
          builder = builder.expression.expression;
        }
        const name = ts.isNewExpression(builder) ? builder.expression.getText(tree) : '';
        const kind =
          name === 'ButtonBuilder'
            ? 'button'
            : name === 'ModalBuilder'
              ? 'modal'
              : name.endsWith('SelectMenuBuilder')
                ? 'select'
                : 'other';
        if (kind !== 'other')
          controls.push({
            kind,
            id,
            file: relative(projectRoot, path).replaceAll('\\', '/'),
            line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          });
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return controls;
}
