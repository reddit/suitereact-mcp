import { TextContent } from '@modelcontextprotocol/sdk/types.js';

interface ScaffoldHtmlDocArgs {
  topic: string;
  style?: 'doc' | 'runbook' | 'rfc' | 'overview';
  subtitle?: string;
}

const baseStyle = `
:root { --bg:#f6f8fb; --fg:#0f172a; --mute:#5a6478; --brand:#0a3d62; --brandHover:#073050; --surface:#ffffff; --border:#e2e8f0; --code:#f0f1f4; }
* { box-sizing: border-box; }
body { font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 32px 0; line-height: 1.65; }
.container { max-width: 880px; margin: 0 auto; padding: 0 24px; }
header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 32px; }
header h1 { font-size: 32px; letter-spacing: -0.02em; margin: 0; }
header .subtitle { color: var(--mute); margin-top: 6px; }
section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px 28px; margin-bottom: 18px; }
section > h2 { margin-top: 0; font-size: 22px; letter-spacing: -0.01em; }
section > h3 { font-size: 16px; color: var(--brand); margin-top: 18px; }
code { background: var(--code); padding: 1px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.92em; }
pre { background: #0f172a; color: #e2e8f0; padding: 16px 18px; border-radius: 8px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
th { background: var(--bg); font-size: 13px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-family: 'JetBrains Mono', monospace; background: var(--brand); color: white; }
.callout { border-left: 3px solid var(--brand); background: #f0f4f8; padding: 12px 16px; border-radius: 4px; margin: 12px 0; }
footer { color: var(--mute); font-size: 13px; text-align: center; margin-top: 32px; }
`;

const styleHeading: Record<string, string> = {
  doc: 'Document',
  runbook: 'Runbook',
  rfc: 'RFC',
  overview: 'Overview',
};

const buildScaffold = (args: ScaffoldHtmlDocArgs): string => {
  const style = args.style ?? 'doc';
  const heading = styleHeading[style] ?? 'Document';
  const today = new Date().toISOString().slice(0, 10);
  const subtitle =
    args.subtitle ?? `Generated ${today} — replace with a one-line summary.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(args.topic)}</title>
  <style>${baseStyle}</style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">${escapeHtml(heading)}</span>
      <h1>${escapeHtml(args.topic)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
    </header>

    <section>
      <h2>Summary</h2>
      <p>One paragraph capturing the goal, audience, and outcome.</p>
    </section>

    <section>
      <h2>Context</h2>
      <p>What problem are we solving? What systems are involved?</p>
      <div class="callout">
        Replace this callout with the most important constraint or risk.
      </div>
    </section>

    <section>
      <h2>Approach</h2>
      <p>Walk through the proposal or procedure step by step.</p>
      <ol>
        <li>Step one — describe the action and expected outcome.</li>
        <li>Step two — note inputs, outputs, and verification.</li>
        <li>Step three — call out rollback or follow-up.</li>
      </ol>
    </section>

    <section>
      <h2>Reference</h2>
      <table>
        <thead><tr><th>Field</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>example_field</code></td><td>What it stores</td></tr>
        </tbody>
      </table>
      <pre><code>// Example snippet
function example() { return 'hello, doc-spaces'; }
</code></pre>
    </section>

    <footer>doc-spaces · ${today}</footer>
  </div>
</body>
</html>`;
};

const escapeHtml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Returns a NetSuite-friendly HTML scaffold for a new doc-spaces document.
 *
 * Implements the `scaffold_html_doc` MCP tool. Output is a complete, styled
 * HTML document ready to upload via `upload_html_doc`.
 */
export async function handleHtmlDocsTemplate(
  args: Record<string, unknown>
): Promise<TextContent[]> {
  try {
    const input = args as unknown as ScaffoldHtmlDocArgs;
    if (!input.topic) {
      throw new Error('topic is required');
    }
    const html = buildScaffold(input);
    return [
      {
        type: 'text',
        text: JSON.stringify(
          {
            tool: 'scaffold_html_doc',
            ok: true,
            topic: input.topic,
            style: input.style ?? 'doc',
            html,
          },
          null,
          2
        ),
      },
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return [
      {
        type: 'text',
        text: JSON.stringify(
          { tool: 'scaffold_html_doc', ok: false, error: message },
          null,
          2
        ),
      },
    ];
  }
}
