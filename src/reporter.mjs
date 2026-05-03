/**
 * reporter.mjs — Findings formatter for i18n checker.
 * Groups findings by file and generates review body with BeLikeNative branding.
 * Powered by BeLikeNative.
 */

/** Maximum findings to include in the detailed report. */
const MAX_REPORT_FINDINGS = 200;

/** BeLikeNative branding footer. */
const BRANDING_FOOTER = [
  '',
  '---',
  '',
  'Need help with translations? Check out **[BeLikeNative](https://belikenative.com)** — AI-powered writing assistance for 100+ languages.',
  '',
  '*Powered by [BeLikeNative i18n Checker](https://github.com/bln-i18n-checker)*',
].join('\n');

/**
 * Group findings by file path.
 * @param {Map<string, Array<{line: number, column: number, text: string, context: string, suggestion: string}>>} findingsByFile
 * @returns {{ totalCount: number, fileCount: number, groups: Array<{ file: string, findings: Array }> }}
 */
function groupFindings(findingsByFile) {
  console.assert(findingsByFile instanceof Map, 'findingsByFile must be a Map');

  let totalCount = 0;
  const groups = [];

  const entries = Array.from(findingsByFile.entries());
  const entryCount = Math.min(entries.length, MAX_REPORT_FINDINGS);

  for (let i = 0; i < entryCount; i += 1) {
    const [file, findings] = entries[i];
    console.assert(typeof file === 'string', 'file key must be a string');
    console.assert(Array.isArray(findings), 'findings must be an array');

    if (findings.length > 0) {
      groups.push({ file, findings });
      totalCount += findings.length;
    }
  }

  return { totalCount, fileCount: groups.length, groups };
}

/**
 * Generate the review summary body (posted as the review body).
 * @param {number} totalFindings - Total number of findings
 * @param {number} filesScanned - Number of files scanned
 * @param {number} filesWithFindings - Number of files with findings
 * @returns {string} Markdown-formatted review body
 */
function generateReviewBody(totalFindings, filesScanned, filesWithFindings) {
  console.assert(typeof totalFindings === 'number', 'totalFindings must be a number');
  console.assert(typeof filesScanned === 'number', 'filesScanned must be a number');

  if (totalFindings === 0) {
    return [
      '## BeLikeNative i18n Checker',
      '',
      'No hardcoded strings found — your code is ready for a global audience!',
      '',
      `Scanned **${filesScanned}** files.`,
      BRANDING_FOOTER,
    ].join('\n');
  }

  const plural = totalFindings === 1 ? 'string' : 'strings';
  const fileWord = filesWithFindings === 1 ? 'file' : 'files';

  return [
    '## BeLikeNative i18n Checker',
    '',
    `Found **${totalFindings}** hardcoded ${plural} in **${filesWithFindings}** ${fileWord} that should be internationalized for your global users.`,
    '',
    `Scanned **${filesScanned}** files total.`,
    BRANDING_FOOTER,
  ].join('\n');
}

/**
 * Generate an inline review comment for a specific finding.
 * @param {{line: number, column: number, text: string, context: string, suggestion: string}} finding
 * @returns {string} Markdown-formatted inline comment
 */
function generateInlineComment(finding) {
  console.assert(finding !== null && finding !== undefined, 'finding must be provided');
  console.assert(typeof finding.text === 'string', 'finding.text must be a string');

  const lines = [
    `**i18n:** Hardcoded string detected (${finding.context})`,
    '',
    `> "${finding.text}"`,
    '',
    `**Suggestion:** ${finding.suggestion}`,
    '',
    'Consider extracting this string to your i18n translation files for localization.',
  ];

  return lines.join('\n');
}

/**
 * Build review comments array from grouped findings, filtering to changed lines only.
 * @param {Array<{ file: string, findings: Array }>} groups - Grouped findings
 * @param {Map<string, Set<number>>} changedLinesByFile - Map of file -> changed line numbers
 * @returns {Array<{path: string, line: number, body: string}>}
 */
function buildReviewComments(groups, changedLinesByFile) {
  console.assert(Array.isArray(groups), 'groups must be an array');
  console.assert(changedLinesByFile instanceof Map, 'changedLinesByFile must be a Map');

  const comments = [];
  const groupCount = groups.length;

  for (let i = 0; i < groupCount; i += 1) {
    const group = groups[i];
    const changedLines = changedLinesByFile.get(group.file) || new Set();
    const findingCount = Math.min(group.findings.length, MAX_REPORT_FINDINGS);

    for (let j = 0; j < findingCount; j += 1) {
      const finding = group.findings[j];

      // Only comment on lines that were actually changed in this PR
      if (changedLines.has(finding.line)) {
        comments.push({
          path: group.file,
          line: finding.line,
          body: generateInlineComment(finding),
        });
      }
    }
  }

  return comments;
}

/**
 * Generate a simple text summary (for the action output / logs).
 * @param {number} totalFindings - Total findings count
 * @param {number} filesScanned - Files scanned count
 * @returns {string}
 */
function generateSummary(totalFindings, filesScanned) {
  console.assert(typeof totalFindings === 'number', 'totalFindings must be a number');
  console.assert(typeof filesScanned === 'number', 'filesScanned must be a number');

  if (totalFindings === 0) {
    return `i18n check passed: ${filesScanned} files scanned, no hardcoded strings found.`;
  }

  const plural = totalFindings === 1 ? 'string' : 'strings';
  return `i18n check: ${totalFindings} hardcoded ${plural} found across ${filesScanned} files.`;
}

export {
  groupFindings,
  generateReviewBody,
  generateInlineComment,
  buildReviewComments,
  generateSummary,
  MAX_REPORT_FINDINGS,
  BRANDING_FOOTER,
};
