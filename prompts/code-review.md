Review this pull request like a senior engineer.

Look only at the annotated diff. Each new-file line starts with L<n> (real line number in the file after the change). Find real problems:

- bugs and broken logic
- security issues (auth, secrets, injection, unsafe file or shell use)
- error handling that hides failures
- data loss or incorrect API use
- spelling, grammar, or typo errors in user-facing text, comments, messages, docs, and identifiers that are clearly misspelled

Skip style nits, formatting, and naming preferences unless they cause a real defect or a clear misspelling.

Return ONLY valid JSON in this shape:

{
  "summary": "short markdown: what the PR does, overall risk, and whether it is safe to merge",
  "findings": [
    {
      "severity": "high",
      "file": "path/from/the/diff",
      "line": 12,
      "message": "what is wrong and how to fix it"
    }
  ]
}

Rules:

- severity must be one of: high, medium, low, info
- "line" must be the number from the L<n> prefix on that line, never an index in this prompt
- file and line must exist in the annotated diff
- do not invent files, lines, or issues that are not in the diff
- if the change looks fine, use an empty findings array and say why in summary
- do not include the token, credentials, or the full diff in summary or messages
