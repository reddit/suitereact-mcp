# Source and Artifact Provenance

## Maintained source

The TypeScript, JavaScript, XML, Markdown, and configuration files in this
repository are the maintained project source. Contributors must submit only
material they have the right to license under BSD-3-Clause.

## Generated artifacts

The following are intentionally excluded from Git:

- `apps/*/client/` browser bundles;
- `dist/` SuiteCloud deployment output;
- `mcp/.vectordb/` semantic embeddings;
- generated HTML design exports under `docs/`;
- test screenshots, browser profiles, and workflow state.

Reproduce browser and deployment artifacts with `npm run build`. The MCP server
always supports lexical retrieval from the maintained resources. Maintainers
may generate a local semantic cache with `npm --prefix mcp run rebuild-vectors`
after reviewing the resource corpus and configuring an OpenAI API key.

## External references

The SuiteQL resource guides are original summaries and examples intended to
interoperate with NetSuite. They link to Oracle documentation rather than
copying Oracle manuals. Release review must confirm that future resource
additions remain original, appropriately quoted, or separately licensed.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for vendored and
dependency notices.
