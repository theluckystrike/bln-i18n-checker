# BeLikeNative i18n Checker

**Find hardcoded strings that should be internationalized.** Powered by [BeLikeNative](https://belikenative.com) -- AI-powered writing assistance for 100+ languages.

This GitHub Action scans JavaScript and TypeScript files in your pull requests for hardcoded user-facing strings that should be extracted for internationalization (i18n). It posts inline review comments with suggestions for each finding.

## Why i18n matters

Hardcoded strings make it impossible to translate your app for international users. Even if you only support English today, extracting strings early saves enormous refactoring effort later. This action catches hardcoded strings before they make it into your codebase.

## Usage

Add this to `.github/workflows/i18n-check.yml`:

```yaml
name: i18n Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  i18n-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: theluckystrike/bln-i18n-checker@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## What it detects

| Pattern | Example | Flagged? |
|---------|---------|----------|
| JSX text content | `<button>Submit</button>` | Yes |
| JSX text content | `<p>Welcome back, friend</p>` | Yes |
| placeholder attribute | `placeholder="Enter your email"` | Yes |
| title attribute | `title="Click to save"` | Yes |
| alt attribute | `alt="User profile photo"` | Yes |
| aria-label attribute | `aria-label="Close dialog"` | Yes |
| label attribute | `label="Username"` | Yes |
| Template literals in JSX | `` <span>{`Hello World`}</span> `` | Yes |

## What it skips

| Pattern | Example | Why |
|---------|---------|-----|
| console.log/warn/error | `console.log("debug info")` | Not user-facing |
| Import statements | `import X from './path'` | Code infrastructure |
| Comments | `// This is a comment` | Not rendered |
| CSS class names | `className="btn-primary"` | Styling tokens |
| Object keys | `{ key: "value" }` | Data structure |
| Type annotations | `type Props = { ... }` | TypeScript types |
| URLs and paths | `"/api/users"` | Technical strings |
| Hex colors | `"#ff0000"` | Not text |
| camelCase identifiers | `"onClick"` | Code tokens |
| ALL_CAPS constants | `"API_KEY"` | Constants |
| Short identifiers | `"id"`, `"ok"` | Too short / ambiguous |
| Single characters | `"x"` | Not meaningful text |

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for API access (required) | -- |
| `file-patterns` | Glob pattern for files to scan | `**/*.{js,jsx,ts,tsx}` |
| `min-string-length` | Minimum string length to flag | `3` |

## Outputs

| Output | Description |
|--------|-------------|
| `findings-count` | Total number of hardcoded strings found |
| `files-scanned` | Number of files scanned |

## How it works

1. When a PR is opened or updated, the action fetches the list of changed files.
2. Files matching the configured patterns (JS/JSX/TS/TSX by default) are scanned.
3. The scanner parses each file line by line, detecting:
   - Text content between JSX tags (`>text<`)
   - String values in UI-related props (`placeholder`, `title`, `alt`, `aria-label`, `label`)
4. Results are filtered to only flag findings on lines actually changed in the PR.
5. A review is posted with inline comments showing each finding and a suggested i18n key.

## Example review comment

When the action finds a hardcoded string, it posts a comment like this:

> **i18n:** Hardcoded string detected (JSX text content)
>
> > "Submit your application"
>
> **Suggestion:** Replace with `{t('submit_your_application')}`
>
> Consider extracting this string to your i18n translation files for localization.

## Built with

- [BeLikeNative](https://belikenative.com) -- AI-powered writing assistance for 100+ languages
- [@actions/core](https://github.com/actions/toolkit) -- GitHub Actions toolkit
- [@actions/github](https://github.com/actions/toolkit) -- GitHub API client for Actions

---

## BeLikeNative Developer Tools

This tool is part of the **[BeLikeNative](https://belikenative.com)** ecosystem — AI-powered writing tools for non-native English speakers.

| Tool | Type | Description |
|------|------|-------------|
| [Grammar Check](https://github.com/theluckystrike/belikenative-grammar-check) | GitHub Action | PR grammar checker with 60 rules and L1-aware insights |
| [Writing Assistant](https://github.com/theluckystrike/bln-writing-assistant) | GitHub Action | Writing quality analysis: readability, structure, clarity |
| [Commit Lint](https://github.com/theluckystrike/bln-commit-lint) | GitHub Action | Commit message grammar, format & clarity checker |
| [MCP Grammar Server](https://github.com/theluckystrike/bln-mcp-grammar-server) | MCP Server | 70 local grammar rules for Claude Desktop & Cursor |
| [Website Grader](https://github.com/theluckystrike/bln-website-grader) | Web Tool | Free website performance grader |

**[BeLikeNative Chrome Extension](https://chromewebstore.google.com/detail/belikenative-ai-writing-a/gchojmpfpbpmpfgdppfdkpchikbcgabp)** — AI writing assistant for 100+ languages, 15 tones, 15 styles. 10,000+ users, 4.6★ rating.

## License

MIT
