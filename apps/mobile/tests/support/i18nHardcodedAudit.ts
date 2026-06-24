import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface HardcodedLiteralFinding {
  file: string;
  line: number;
  literal: string;
}

interface AllowlistEntry {
  file: string;
  literal: string;
  reason: string;
}

const MOBILE_ROOT = process.cwd();
const SOURCE_ROOTS = [
  path.join(MOBILE_ROOT, 'app'),
  path.join(MOBILE_ROOT, 'src'),
];

const EXCLUDED_RELATIVE_PATH_PREFIXES = [
  'src/config/',
  'src/testing/',
  'src/theme/',
  'src/i18n/catalog.ts',
  'src/i18n/formatters.ts',
  'src/i18n/index.tsx',
  'src/i18n/locale.ts',
  'src/i18n/storage.ts',
  'src/lib/api.ts',
  'src/lib/format.ts',
] as const;

export const HARD_CODED_STRING_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: 'src/components/ui/ScreenHeader.tsx',
    literal: '‹',
    reason: 'Back icon glyph, not interface copy.',
  },
  {
    file: 'src/components/ui/MoneyText.tsx',
    literal: '—',
    reason: 'Neutral missing-value glyph, not language-specific UI copy.',
  },
  {
    file: 'src/components/WorkingHoursScreenView.tsx',
    literal: 'HH:mm',
    reason: 'Time-format mask placeholder shared across locales.',
  },
  {
    file: 'src/i18n/errors.ts',
    literal: 'User not found',
    reason: 'Legacy backend message matcher used only for structured localization fallback.',
  },
  {
    file: 'src/i18n/errors.ts',
    literal: 'User is already an employee of this barbershop',
    reason: 'Legacy backend message matcher used only for structured localization fallback.',
  },
  {
    file: 'src/lib/constants.ts',
    literal: 'BarberApp',
    reason: 'Approved brand name remains untranslated.',
  },
] as const;

const ALLOWLIST_KEYS = new Set(
  HARD_CODED_STRING_ALLOWLIST.map((entry) => `${entry.file}::${entry.literal}`),
);

const PROPERTY_NAME_ALLOWLIST = new Set([
  'testID',
  'name',
  'presentation',
  'strategy',
  'currency',
  'timeZone',
  'locale',
  'languageTag',
  'languageCode',
  'languageScriptCode',
  'regionCode',
  'source',
  'href',
  'path',
  'keyboardType',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
  'variant',
  'size',
  'id',
  'status',
  'role',
]);

function listFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === '__tests__'
        || entry.name === 'node_modules'
        || entry.name === 'locales'
      ) {
        continue;
      }

      files.push(...listFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }

    if (
      entry.name.endsWith('.test.ts')
      || entry.name.endsWith('.test.tsx')
      || entry.name.endsWith('.d.ts')
    ) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function hasLetters(value: string): boolean {
  return /\p{L}/u.test(value);
}

function isTranslationKey(value: string): boolean {
  return /^[a-z]+(?:\.[A-Za-z0-9_-]+)+$/.test(value);
}

function isInternalCode(value: string): boolean {
  return /^[A-Z0-9_:-]+$/.test(value);
}

function isRouteOrModuleLiteral(value: string): boolean {
  return (
    value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('@/') 
    || value.startsWith('/')
    || value.includes('.js')
    || value.includes('.ts')
  );
}

function isBenignSingleToken(value: string): boolean {
  return /^[a-z][A-Za-z0-9_-]*$/.test(value);
}

function isStyleLiteral(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    || /^rgba?\(/.test(value);
}

function getPropertyName(node: ts.Node): string | null {
  if (!ts.isPropertyAssignment(node.parent)) {
    return null;
  }

  const { name } = node.parent;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
}

function hasAncestorCall(node: ts.Node, expressionText: string): boolean {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isCallExpression(current) && current.expression.getText() === expressionText) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function shouldIgnoreLiteral(node: ts.Node, value: string): boolean {
  if (!value.trim() || !hasLetters(value)) {
    return true;
  }

  if (
    isRouteOrModuleLiteral(value)
    || isTranslationKey(value)
    || isInternalCode(value)
    || isStyleLiteral(value)
    || /^\d+[A-Za-z]+$/.test(value)
  ) {
    return true;
  }

  if (hasAncestorCall(node, 'localizeUnknownError')) {
    return true;
  }

  const propertyName = getPropertyName(node);
  if (propertyName && PROPERTY_NAME_ALLOWLIST.has(propertyName)) {
    return true;
  }

  if (
    ts.isImportDeclaration(node.parent)
    || ts.isExportDeclaration(node.parent)
    || ts.isLiteralTypeNode(node.parent)
    || ts.isTypeAliasDeclaration(node.parent)
    || ts.isImportTypeNode(node.parent)
  ) {
    return true;
  }

  if (ts.isCallExpression(node.parent)) {
    const expressionText = node.parent.expression.getText();
    if (
      expressionText === 't'
      || expressionText === 'translate'
      || expressionText === 'localizeUnknownError'
    ) {
      return true;
    }
  }

  if (ts.isJsxAttribute(node.parent)) {
    if (
      node.parent.name.text === 'testID'
      || node.parent.name.text === 'name'
      || node.parent.name.text === 'presentation'
      || node.parent.name.text === 'href'
    ) {
      return true;
    }
  }

  if (isBenignSingleToken(value)) {
    return true;
  }

  return false;
}

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function relativeToMobile(filePath: string): string {
  return path.relative(MOBILE_ROOT, filePath).replaceAll(path.sep, '/');
}

export function collectHardcodedLiteralFindings(): HardcodedLiteralFinding[] {
  const findings: HardcodedLiteralFinding[] = [];
  const files = SOURCE_ROOTS.flatMap(listFiles);

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const relativeFile = relativeToMobile(filePath);

    if (EXCLUDED_RELATIVE_PATH_PREFIXES.some((prefix) => relativeFile.startsWith(prefix))) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const value = node.text.trim();
        if (!shouldIgnoreLiteral(node, value) && !ALLOWLIST_KEYS.has(`${relativeFile}::${value}`)) {
          findings.push({
            file: relativeFile,
            line: getLine(sourceFile, node),
            literal: value,
          });
        }
      }

      if (ts.isJsxText(node)) {
        const value = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
        if (
          value
          && hasLetters(value)
          && !ALLOWLIST_KEYS.has(`${relativeFile}::${value}`)
        ) {
          findings.push({
            file: relativeFile,
            line: getLine(sourceFile, node),
            literal: value,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return findings;
}
