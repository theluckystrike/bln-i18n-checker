/**
 * scanner.mjs — String detection engine for i18n checker.
 * Detects hardcoded user-facing strings in JSX/TSX files.
 * Powered by BeLikeNative.
 */

/** UI-related props that typically contain user-facing text. */
const UI_PROPS = Object.freeze([
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

/** Patterns that indicate a line should be skipped entirely. */
const SKIP_LINE_PATTERNS = Object.freeze([
  /^\s*\/\//,                    // single-line comment
  /^\s*\*/,                      // block comment continuation
  /^\s*\/\*/,                    // block comment start
  /^\s*import\s/,                // import statement
  /^\s*import\(/,                // dynamic import
  /^\s*require\s*\(/,            // require call
  /console\.(log|warn|error|info|debug|trace)\s*\(/, // console methods
  /^\s*export\s+(type|interface)\s/, // TypeScript type exports
  /^\s*(type|interface)\s+\w+/,  // TypeScript type/interface declarations
  /className\s*[=:]/,            // className assignments
  /classList/,                    // classList manipulations
  /^\s*\/\/\s*eslint/,           // eslint directives
  /^\s*\/\/\s*@ts-/,             // TypeScript directives
]);

/** Max lines per file to prevent unbounded processing. */
const MAX_FILE_LINES = 50_000;

/**
 * Check if a line is inside a block comment region.
 * @param {string} line - Source line
 * @param {boolean} wasInComment - Whether previous line was in a block comment
 * @returns {{ inComment: boolean, skipLine: boolean }}
 */
function checkCommentState(line, wasInComment) {
  console.assert(typeof line === 'string', 'line must be a string');
  console.assert(typeof wasInComment === 'boolean', 'wasInComment must be boolean');

  const trimmed = line.trim();

  if (wasInComment) {
    const endIdx = trimmed.indexOf('*/');
    if (endIdx === -1) {
      return { inComment: true, skipLine: true };
    }
    return { inComment: false, skipLine: true };
  }

  const startIdx = trimmed.indexOf('/*');
  if (startIdx !== -1) {
    const endIdx = trimmed.indexOf('*/', startIdx + 2);
    if (endIdx === -1) {
      return { inComment: true, skipLine: true };
    }
    // Inline block comment — partial skip; let other checks handle rest
    return { inComment: false, skipLine: false };
  }

  return { inComment: false, skipLine: false };
}

/**
 * Check if a line should be entirely skipped based on known patterns.
 * @param {string} line - Source line
 * @returns {boolean}
 */
function shouldSkipLine(line) {
  console.assert(typeof line === 'string', 'line must be a string');
  console.assert(line.length <= 10_000, 'line length exceeds safety limit');

  const patternCount = SKIP_LINE_PATTERNS.length;
  for (let i = 0; i < patternCount; i += 1) {
    if (SKIP_LINE_PATTERNS[i].test(line)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a string value looks like a non-translatable token.
 * @param {string} text - The string content (without quotes)
 * @returns {boolean}
 */
function isNonTranslatable(text) {
  console.assert(typeof text === 'string', 'text must be a string');
  console.assert(text.length < 5_000, 'text exceeds safety limit');

  const trimmed = text.trim();

  // Empty or whitespace only
  if (trimmed.length === 0) return true;

  // Single character
  if (trimmed.length === 1) return true;

  // Looks like a CSS class, ID, or code token (no spaces, has dashes/dots/underscores)
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed) && !/ /.test(trimmed) && /[-._]/.test(trimmed)) {
    return true;
  }

  // Looks like a URL or path
  if (/^(https?:\/\/|\/|\.\/|\.\.\/)/.test(trimmed)) return true;

  // Looks like a hex color
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;

  // Looks like a number or numeric expression
  if (/^[0-9.,]+(%|px|em|rem|vh|vw|pt|deg)?$/.test(trimmed)) return true;

  // Looks like a MIME type
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(trimmed)) return true;

  // Single word all lowercase with no spaces (likely a key/identifier)
  if (/^[a-z][a-z0-9]*$/.test(trimmed) && trimmed.length < 12) return true;

  // camelCase or PascalCase identifiers
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(trimmed) && /[a-z][A-Z]/.test(trimmed)) return true;

  // ALL_CAPS constants
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return true;

  // Event names (onClick, onSubmit, etc.)
  if (/^on[A-Z]/.test(trimmed)) return true;

  // HTML tag names
  if (/^(div|span|button|input|form|p|h[1-6]|ul|ol|li|a|img|table|tr|td|th|nav|section|article|header|footer|main|aside)$/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Extract JSX text content (text between > and <).
 * @param {string} line - Source line
 * @param {number} lineNum - 1-based line number
 * @param {number} minLen - Minimum string length to report
 * @returns {Array<{line: number, column: number, text: string, context: string, suggestion: string}>}
 */
function extractJsxTextContent(line, lineNum, minLen) {
  console.assert(typeof line === 'string', 'line must be a string');
  console.assert(typeof lineNum === 'number' && lineNum > 0, 'lineNum must be positive');

  const findings = [];
  // Match text between closing > and opening <
  const jsxTextRegex = />\s*([^<>{}`]+?)\s*</g;
  let match;
  const maxIterations = 100;
  let iterations = 0;

  while ((match = jsxTextRegex.exec(line)) !== null && iterations < maxIterations) {
    iterations += 1;
    const text = match[1].trim();
    if (text.length >= minLen && !isNonTranslatable(text)) {
      // Must contain at least one letter (not just symbols/numbers)
      if (/[a-zA-Z]/.test(text)) {
        findings.push({
          line: lineNum,
          column: match.index + 1,
          text,
          context: 'JSX text content',
          suggestion: `Replace with {t('${toI18nKey(text)}')}`,
        });
      }
    }
  }

  return findings;
}

/**
 * Extract hardcoded string props from a line.
 * @param {string} line - Source line
 * @param {number} lineNum - 1-based line number
 * @param {number} minLen - Minimum string length to report
 * @returns {Array<{line: number, column: number, text: string, context: string, suggestion: string}>}
 */
function extractStringProps(line, lineNum, minLen) {
  console.assert(typeof line === 'string', 'line must be a string');
  console.assert(typeof lineNum === 'number' && lineNum > 0, 'lineNum must be positive');

  const findings = [];
  const propCount = UI_PROPS.length;

  for (let i = 0; i < propCount; i += 1) {
    const prop = UI_PROPS[i];
    // Match prop="value" or prop='value'
    const regex = new RegExp(`${prop}\\s*=\\s*["']([^"']+)["']`, 'g');
    let match;
    const maxIterations = 50;
    let iterations = 0;

    while ((match = regex.exec(line)) !== null && iterations < maxIterations) {
      iterations += 1;
      const text = match[1].trim();
      if (text.length >= minLen && !isNonTranslatable(text)) {
        if (/[a-zA-Z]/.test(text)) {
          findings.push({
            line: lineNum,
            column: match.index + 1,
            text,
            context: `${prop} attribute`,
            suggestion: `Replace with ${prop}={t('${toI18nKey(text)}')}`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Convert user-facing text to a suggested i18n key.
 * @param {string} text - The text to convert
 * @returns {string} A suggested i18n key
 */
function toI18nKey(text) {
  console.assert(typeof text === 'string', 'text must be a string');
  console.assert(text.length > 0, 'text must not be empty');

  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);

  return key || 'untitled';
}

/**
 * Check if a line contains an object key pattern (key: "value" or key: 'value').
 * @param {string} line - Source line
 * @param {number} matchIndex - Index of the match in the line
 * @returns {boolean}
 */
function isObjectKeyContext(line, matchIndex) {
  console.assert(typeof line === 'string', 'line must be a string');
  console.assert(typeof matchIndex === 'number', 'matchIndex must be a number');

  // Check if the string appears after a colon (object value) with a key before it
  const before = line.slice(0, matchIndex).trim();
  if (/^\s*\w+\s*:$/.test(before) || /,\s*\w+\s*:$/.test(before)) {
    return true;
  }
  return false;
}

/**
 * Scan file content for hardcoded strings that need i18n.
 * @param {string} content - File content
 * @param {number} minStringLength - Minimum string length to flag
 * @returns {Array<{line: number, column: number, text: string, context: string, suggestion: string}>}
 */
function scanFileContent(content, minStringLength) {
  console.assert(typeof content === 'string', 'content must be a string');
  console.assert(typeof minStringLength === 'number', 'minStringLength must be a number');

  const lines = content.split('\n');
  const lineCount = Math.min(lines.length, MAX_FILE_LINES);
  const allFindings = [];
  let inBlockComment = false;

  for (let i = 0; i < lineCount; i += 1) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check comment state
    const commentState = checkCommentState(line, inBlockComment);
    inBlockComment = commentState.inComment;
    if (commentState.skipLine) continue;

    // Skip known non-translatable patterns
    if (shouldSkipLine(line)) continue;

    // Extract JSX text content
    const jsxFindings = extractJsxTextContent(line, lineNum, minStringLength);
    for (let j = 0; j < jsxFindings.length; j += 1) {
      allFindings.push(jsxFindings[j]);
    }

    // Extract string props
    const propFindings = extractStringProps(line, lineNum, minStringLength);
    for (let k = 0; k < propFindings.length; k += 1) {
      allFindings.push(propFindings[k]);
    }
  }

  return allFindings;
}

export {
  scanFileContent,
  extractJsxTextContent,
  extractStringProps,
  shouldSkipLine,
  isNonTranslatable,
  checkCommentState,
  toI18nKey,
  isObjectKeyContext,
  UI_PROPS,
  MAX_FILE_LINES,
};
