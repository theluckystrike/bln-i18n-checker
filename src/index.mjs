/**
 * index.mjs — Orchestrator for BeLikeNative i18n Checker.
 * Gets PR changed files, runs i18n scan, posts review comments.
 * Powered by BeLikeNative.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { scanFileContent } from './scanner.mjs';
import {
  fetchPRFiles,
  fetchFileContent,
  extractChangedLines,
  postReview,
  postComment,
} from './github-api.mjs';
import {
  groupFindings,
  generateReviewBody,
  buildReviewComments,
  generateSummary,
} from './reporter.mjs';

/** Maximum files to scan in a single run. */
const MAX_SCAN_FILES = 100;

/** File extensions that are scannable. */
const SCANNABLE_EXTENSIONS = Object.freeze([
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.mts',
]);

/**
 * Check if a filename matches the scannable patterns.
 * @param {string} filename - File path to check
 * @returns {boolean}
 */
function isScannable(filename) {
  console.assert(typeof filename === 'string', 'filename must be a string');
  console.assert(filename.length > 0, 'filename must not be empty');

  const extCount = SCANNABLE_EXTENSIONS.length;
  for (let i = 0; i < extCount; i += 1) {
    if (filename.endsWith(SCANNABLE_EXTENSIONS[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Filter PR files to only include scannable, non-deleted files.
 * @param {Array<{filename: string, status: string, patch: string}>} files
 * @returns {Array<{filename: string, status: string, patch: string}>}
 */
function filterFiles(files) {
  console.assert(Array.isArray(files), 'files must be an array');

  const filtered = [];
  const fileCount = Math.min(files.length, MAX_SCAN_FILES);

  for (let i = 0; i < fileCount; i += 1) {
    const file = files[i];
    // Skip deleted files and non-scannable extensions
    if (file.status !== 'removed' && isScannable(file.filename)) {
      filtered.push(file);
    }
  }

  console.assert(filtered.length <= MAX_SCAN_FILES, 'filtered files must not exceed limit');
  return filtered;
}

/**
 * Scan a single file and return findings.
 * @param {import('@actions/github').GitHub} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} filename
 * @param {string} ref
 * @param {number} minStringLength
 * @returns {Promise<Array<{line: number, column: number, text: string, context: string, suggestion: string}>>}
 */
async function scanSingleFile(octokit, owner, repo, filename, ref, minStringLength) {
  console.assert(typeof filename === 'string', 'filename must be a string');
  console.assert(typeof minStringLength === 'number', 'minStringLength must be a number');

  try {
    const content = await fetchFileContent(octokit, owner, repo, filename, ref);
    const findings = scanFileContent(content, minStringLength);
    return findings;
  } catch (err) {
    core.warning(`Failed to scan ${filename}: ${err.message}`);
    return [];
  }
}

/**
 * Scan all files and collect findings + changed line maps.
 * @param {*} octokit - GitHub client
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {string} headSha - Head commit SHA
 * @param {Array} scannableFiles - Files to scan
 * @param {number} minStringLength - Minimum string length
 * @returns {Promise<{findingsByFile: Map, changedLinesByFile: Map}>}
 */
async function scanAllFiles(octokit, owner, repo, headSha, scannableFiles, minStringLength) {
  console.assert(Array.isArray(scannableFiles), 'scannableFiles must be an array');
  console.assert(typeof minStringLength === 'number', 'minStringLength must be a number');

  const findingsByFile = new Map();
  const changedLinesByFile = new Map();
  const fileCount = scannableFiles.length;

  for (let i = 0; i < fileCount; i += 1) {
    const file = scannableFiles[i];
    core.info(`Scanning (${i + 1}/${fileCount}): ${file.filename}`);

    const findings = await scanSingleFile(
      octokit, owner, repo, file.filename, headSha, minStringLength
    );

    if (findings.length > 0) {
      findingsByFile.set(file.filename, findings);
    }

    const changedLines = extractChangedLines(file.patch);
    changedLinesByFile.set(file.filename, changedLines);
  }

  return { findingsByFile, changedLinesByFile };
}

/**
 * Post scan results as a PR review or comment.
 * @param {*} octokit - GitHub client
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {number} pullNumber - PR number
 * @param {string} headSha - Head commit SHA
 * @param {{totalCount: number, fileCount: number, groups: Array}} grouped - Grouped findings
 * @param {Map} changedLinesByFile - Changed line numbers by file
 * @param {number} filesScanned - Total files scanned
 * @returns {Promise<void>}
 */
async function postResults(octokit, owner, repo, pullNumber, headSha, grouped, changedLinesByFile, filesScanned) {
  console.assert(grouped !== null && grouped !== undefined, 'grouped must be provided');
  console.assert(typeof filesScanned === 'number', 'filesScanned must be a number');

  const reviewBody = generateReviewBody(grouped.totalCount, filesScanned, grouped.fileCount);
  core.info(generateSummary(grouped.totalCount, filesScanned));

  if (grouped.totalCount === 0) return;

  const comments = buildReviewComments(grouped.groups, changedLinesByFile);

  if (comments.length > 0) {
    try {
      await postReview(octokit, owner, repo, pullNumber, headSha, reviewBody, comments);
      core.info(`Posted review with ${comments.length} inline comments`);
    } catch (err) {
      core.warning(`Failed to post review: ${err.message}. Falling back to comment.`);
      await postComment(octokit, owner, repo, pullNumber, reviewBody);
    }
  } else {
    await postComment(octokit, owner, repo, pullNumber, reviewBody);
    core.info('Posted summary comment (no findings on changed lines)');
  }
}

/**
 * Read and validate action inputs from the GitHub context.
 * @returns {{ token: string, minStringLength: number, octokit: *, owner: string, repo: string, pullNumber: number, headSha: string }}
 */
function readActionInputs() {
  const context = github.context;
  console.assert(context.payload.pull_request !== undefined, 'pull_request payload must exist');

  const token = core.getInput('github-token', { required: true });
  const minStringLength = parseInt(core.getInput('min-string-length') || '3', 10);

  console.assert(typeof token === 'string' && token.length > 0, 'token must be provided');
  console.assert(!isNaN(minStringLength), 'min-string-length must be a valid number');

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request.number;
  const headSha = context.payload.pull_request.head.sha;

  return { token, minStringLength, octokit, owner, repo, pullNumber, headSha };
}

/**
 * Main entry point for the GitHub Action.
 * Orchestrates the full scan-report-comment workflow.
 * @returns {Promise<void>}
 */
async function run() {
  const context = github.context;

  if (context.eventName !== 'pull_request' && context.eventName !== 'pull_request_target') {
    core.warning('i18n Checker only runs on pull_request events. Skipping.');
    return;
  }

  console.assert(context.payload.pull_request !== undefined, 'pull_request payload must exist');

  const { octokit, owner, repo, pullNumber, headSha, minStringLength } = readActionInputs();
  core.info(`Scanning PR #${pullNumber} in ${owner}/${repo}`);

  const allFiles = await fetchPRFiles(octokit, owner, repo, pullNumber);
  const scannableFiles = filterFiles(allFiles);
  core.info(`Found ${allFiles.length} changed files, ${scannableFiles.length} scannable`);

  if (scannableFiles.length === 0) {
    core.info('No scannable files in this PR. Skipping.');
    core.setOutput('findings-count', '0');
    core.setOutput('files-scanned', '0');
    return;
  }

  console.assert(scannableFiles.length > 0, 'must have scannable files at this point');

  const { findingsByFile, changedLinesByFile } = await scanAllFiles(
    octokit, owner, repo, headSha, scannableFiles, minStringLength
  );

  const grouped = groupFindings(findingsByFile);
  await postResults(octokit, owner, repo, pullNumber, headSha, grouped, changedLinesByFile, scannableFiles.length);

  core.setOutput('findings-count', String(grouped.totalCount));
  core.setOutput('files-scanned', String(scannableFiles.length));

  if (grouped.totalCount > 0) {
    core.warning(`Found ${grouped.totalCount} hardcoded strings. Consider internationalizing them.`);
  } else {
    core.info('No hardcoded strings found. Code is i18n-ready!');
  }
}

// Execute
run().catch((error) => {
  core.setFailed(`i18n Checker failed: ${error.message}`);
});

export { run, isScannable, filterFiles, scanSingleFile, scanAllFiles, postResults, readActionInputs, MAX_SCAN_FILES };
