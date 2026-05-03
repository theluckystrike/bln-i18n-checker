/**
 * github-api.mjs — GitHub API wrapper for i18n checker.
 * Handles PR file fetching, review posting, and check status.
 * Powered by BeLikeNative.
 */

/** Maximum files to process per PR to bound execution time. */
const MAX_PR_FILES = 300;

/** Maximum review comments per submission (GitHub API limit is 60). */
const MAX_REVIEW_COMMENTS = 50;

/**
 * Fetch the list of changed files in a pull request.
 * @param {import('@actions/github').GitHub} octokit - GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} pullNumber - PR number
 * @returns {Promise<Array<{filename: string, status: string, patch: string}>>}
 */
async function fetchPRFiles(octokit, owner, repo, pullNumber) {
  console.assert(octokit !== null && octokit !== undefined, 'octokit must be provided');
  console.assert(typeof owner === 'string' && owner.length > 0, 'owner must be non-empty string');
  console.assert(typeof repo === 'string' && repo.length > 0, 'repo must be non-empty string');
  console.assert(typeof pullNumber === 'number' && pullNumber > 0, 'pullNumber must be positive');

  const response = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  console.assert(Array.isArray(response.data), 'API response data must be an array');

  const files = response.data.slice(0, MAX_PR_FILES);
  return files.map((file) => ({
    filename: file.filename,
    status: file.status,
    patch: file.patch || '',
  }));
}

/**
 * Fetch the content of a single file from the repository.
 * @param {import('@actions/github').GitHub} octokit - GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path in repo
 * @param {string} ref - Git ref (branch/SHA)
 * @returns {Promise<string>} File content
 */
async function fetchFileContent(octokit, owner, repo, path, ref) {
  console.assert(octokit !== null && octokit !== undefined, 'octokit must be provided');
  console.assert(typeof path === 'string' && path.length > 0, 'path must be non-empty string');

  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref,
  });

  console.assert(response.data !== null, 'file content response must not be null');

  const content = response.data.content;
  console.assert(typeof content === 'string', 'content must be a base64 string');

  return Buffer.from(content, 'base64').toString('utf-8');
}

/**
 * Extract changed line numbers from a patch string.
 * Only lines added (+) in the diff are relevant for review comments.
 * @param {string} patch - The unified diff patch string
 * @returns {Set<number>} Set of line numbers that were added/changed
 */
function extractChangedLines(patch) {
  console.assert(typeof patch === 'string', 'patch must be a string');

  const changedLines = new Set();
  if (patch.length === 0) return changedLines;

  const lines = patch.split('\n');
  const lineCount = Math.min(lines.length, 10_000);
  let currentLine = 0;

  for (let i = 0; i < lineCount; i += 1) {
    const line = lines[i];

    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch !== null) {
      currentLine = parseInt(hunkMatch[1], 10);
      console.assert(!isNaN(currentLine), 'parsed line number must be valid');
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      changedLines.add(currentLine);
      currentLine += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed lines don't advance the new file line counter
      continue;
    } else {
      // Context line
      currentLine += 1;
    }
  }

  return changedLines;
}

/**
 * Post a pull request review with inline comments.
 * @param {import('@actions/github').GitHub} octokit - GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} pullNumber - PR number
 * @param {string} commitId - Head commit SHA
 * @param {string} body - Review summary body
 * @param {Array<{path: string, line: number, body: string}>} comments - Inline comments
 * @returns {Promise<void>}
 */
async function postReview(octokit, owner, repo, pullNumber, commitId, body, comments) {
  console.assert(octokit !== null && octokit !== undefined, 'octokit must be provided');
  console.assert(typeof body === 'string' && body.length > 0, 'body must be non-empty string');
  console.assert(Array.isArray(comments), 'comments must be an array');

  // Limit comments to avoid API rejection
  const limitedComments = comments.slice(0, MAX_REVIEW_COMMENTS);

  const event = limitedComments.length > 0 ? 'COMMENT' : 'COMMENT';

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    commit_id: commitId,
    body,
    event,
    comments: limitedComments,
  });
}

/**
 * Post a simple comment on a PR (no inline comments).
 * Used when there are no findings or as a fallback.
 * @param {import('@actions/github').GitHub} octokit - GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} pullNumber - PR number
 * @param {string} body - Comment body
 * @returns {Promise<void>}
 */
async function postComment(octokit, owner, repo, pullNumber, body) {
  console.assert(octokit !== null && octokit !== undefined, 'octokit must be provided');
  console.assert(typeof body === 'string' && body.length > 0, 'body must be non-empty string');

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
}

export {
  fetchPRFiles,
  fetchFileContent,
  extractChangedLines,
  postReview,
  postComment,
  MAX_PR_FILES,
  MAX_REVIEW_COMMENTS,
};
