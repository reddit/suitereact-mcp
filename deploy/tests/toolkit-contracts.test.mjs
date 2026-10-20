import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflowSkills = [
  'suitereact-full-cycle',
  'suitereact-code',
  'suitereact-test',
  'suitereact-analyze',
  'suitereact-commit',
];

test('workflow skills use one state model', async () => {
  for (const skill of workflowSkills) {
    const content = await readFile(`.agents/skills/${skill}/SKILL.md`, 'utf8');
    assert.doesNotMatch(content, /status\.json|commit-record\.json/);
    assert.match(content, /workflow\.json|suitereact-full-cycle/);
  }
});

test('public full-cycle skill stays concise and has UI metadata', async () => {
  const skill = await readFile(
    '.agents/skills/suitereact-full-cycle/SKILL.md',
    'utf8'
  );
  assert.ok(
    skill.split('\n').length < 100,
    'full-cycle skill should stay under 100 lines'
  );
  assert.match(skill, /<app-name> <goal>/);
  assert.match(skill, /--deploy <environment>/);
  const metadata = await readFile(
    '.agents/skills/suitereact-full-cycle/agents/openai.yaml',
    'utf8'
  );
  assert.match(metadata, /display_name: ['"]Build SuiteReact App['"]/);
  assert.match(metadata, /\$suitereact-full-cycle/);
});

test('workflow schema and root commands expose the canonical tools', async () => {
  const schema = JSON.parse(
    await readFile('deploy/schemas/suitereact-workflow.schema.json', 'utf8')
  );
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.properties.phase.enum, [
    'planning',
    'coding',
    'verifying',
    'ready_to_commit',
    'committed',
    'deployed',
    'blocked',
  ]);
  const testSchema = JSON.parse(
    await readFile('deploy/schemas/suitereact-test-results.schema.json', 'utf8')
  );
  assert.equal(testSchema.properties.schemaVersion.const, 1);
  assert.ok(testSchema.required.includes('actionResponses'));
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  for (const command of [
    'workflow',
    'dev',
    'dev:test',
    'dev:stop',
    'test:app',
  ]) {
    assert.ok(packageJson.scripts[command], `missing npm script ${command}`);
  }
});

test('action and browser test CLIs parse without starting services', () => {
  for (const script of [
    'deploy/test-restlet-action.mjs',
    'deploy/dev-session.mjs',
  ]) {
    const args = script.includes('test-restlet') ? ['--help'] : [];
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
    });
    assert.equal(
      script.includes('test-restlet') ? result.status : 1,
      result.status
    );
  }
});

test('app deployment blocks production-visible local proxy configuration', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(
    packageJson.scripts['check:production-bundle'],
    'node deploy/check-production-bundle.js'
  );

  const validation = await readFile('deploy/validate-app.sh', 'utf8');
  assert.match(validation, /check-production-bundle\.js '\$APP_NAME'/);

  const checker = await readFile('deploy/check-production-bundle.js', 'utf8');
  assert.match(checker, /\.env\.production/);
  assert.match(checker, /\.env\.development\.local/);
  assert.match(checker, /VITE_PROXY_SERVER_BASE_URL/);
  assert.match(checker, /VITE_PROXY_SERVER_TOKEN/);
  assert.match(checker, /developmentProxyUrls/);
  assert.match(checker, /developmentProxyTokens/);
  assert.match(checker, /loopbackUrl/);

  const deploySkill = await readFile(
    '.agents/skills/suitereact-deploy/SKILL.md',
    'utf8'
  );
  assert.match(deploySkill, /\.env\.development\.local/);
  assert.match(deploySkill, /check:production-bundle/);
});

test('NetSuite deployment templates default to disabled least privilege', async () => {
  const suiteletGenerator = await readFile(
    'mcp/src/tools/suiteletGenerator.ts',
    'utf8'
  );
  for (const required of [
    '<allemployees>F</allemployees>',
    '<allroles>F</allroles>',
    '<isdeployed>F</isdeployed>',
    '<loglevel>ERROR</loglevel>',
    '<status>TESTING</status>',
  ]) {
    assert.match(suiteletGenerator, new RegExp(required));
  }
  assert.doesNotMatch(suiteletGenerator, /runasrole>ADMINISTRATOR/);

  const objectFiles = [
    ...(await readdir('sdf/objects/restlet')),
    ...(await readdir('sdf/objects/suitelet')),
  ];
  assert.ok(objectFiles.length > 0);
  for (const fileName of objectFiles) {
    const directory = fileName.includes('_rl_') ? 'restlet' : 'suitelet';
    const content = await readFile(
      `sdf/objects/${directory}/${fileName}`,
      'utf8'
    );
    assert.match(content, /<isdeployed>F<\/isdeployed>/);
    assert.match(content, /<allroles>F<\/allroles>/);
    assert.doesNotMatch(content, /runasrole>ADMINISTRATOR/);
  }
});

test('the action handler deployment keeps security audit entries', async () => {
  const handler = await readFile(
    'sdf/objects/restlet/customscript_sr_rl_rct_action_handler.xml',
    'utf8'
  );
  // ERROR or EMERGENCY would drop log.audit, including approval decisions.
  assert.match(handler, /<loglevel>(AUDIT|DEBUG)<\/loglevel>/);
  const approve = await readFile('sdf/actions/approveTransaction.ts', 'utf8');
  assert.match(approve, /log\.audit\('approveTransaction'/);
  assert.match(approve, /log\.audit\('approveTransaction denied'/);
});

test('LLM routes bind provider and model and render responses as text', async () => {
  const llmProxy = await readFile('sdf/scripts/sr_rl_llm_proxy.ts', 'utf8');
  assert.match(llmProxy, /`\$\{request\.provider\}:\$\{request\.model\}`/);
  assert.match(llmProxy, /allowedProviderModels\.includes\(providerModel\)/);

  const suiteqlBot = await readFile('apps/suiteql-bot/src/App/App.tsx', 'utf8');
  assert.doesNotMatch(suiteqlBot, /\ballowHtml\b/);
});

test('app clients guard local proxy credentials and scan before copying', async () => {
  for (const app of [
    'approval-manager',
    'data-viewer',
    'doc-spaces',
    'invoice-pdf',
    'suiteql-bot',
  ]) {
    const proxyConfig = await readFile(
      app === 'suiteql-bot'
        ? 'apps/suiteql-bot/src/config/runtime.ts'
        : `apps/${app}/src/domain/actions/clientActions.ts`,
      'utf8'
    );
    for (const [constant, variable] of [
      ['LOCAL_PROXY_BASE_URL', 'VITE_PROXY_SERVER_BASE_URL'],
      ['LOCAL_PROXY_TOKEN', 'VITE_PROXY_SERVER_TOKEN'],
    ]) {
      assert.match(
        proxyConfig,
        new RegExp(
          `const ${constant} = import\\.meta\\.env\\.DEV[\\s\\S]{0,100}import\\.meta\\.env\\.${variable}`
        )
      );
      assert.equal(proxyConfig.split(variable).length - 1, 1);
    }
  }

  const buildApp = await readFile('deploy/build-app.js', 'utf8');
  const scanIndex = buildApp.indexOf('check-production-bundle.js');
  const copyIndex = buildApp.indexOf('cpSync(clientPath');
  assert.ok(scanIndex > 0 && scanIndex < copyIndex);
});

test('browser diagnostics do not log proxy credentials or Axios errors', async () => {
  const chatbot = await readFile(
    'suitereact/src/components/NsReactChatbot/index.tsx',
    'utf8'
  );
  assert.doesNotMatch(chatbot, /API Error:[\s\S]{0,40}\berr\b/);

  const proxyClient = await readFile(
    'suitereact/src/clients/NetSuiteProxyClient.ts',
    'utf8'
  );
  assert.doesNotMatch(proxyClient, /console\.(?:warn|error)\([^;]*\bdata:/);
  assert.doesNotMatch(proxyClient, /console\.error\([^;]*,\s*error\s*\)/);
});

test('all proxy consumers authenticate and mutations use the RESTlet gate', async () => {
  const proxyRoutes = await readFile('server/src/routes/nsReactApi.ts', 'utf8');
  assert.doesNotMatch(proxyRoutes, /handleApproveTransactionLocally/);
  assert.match(proxyRoutes, /action: actionProps\.action/);

  for (const filePath of [
    'suitereact/src/components/NsReactDataGrid/index.tsx',
    'suitereact/src/legacy/components/NsReactField/index.tsx',
  ]) {
    const source = await readFile(filePath, 'utf8');
    assert.match(source, /apiToken\?: string/);
    assert.match(source, /X-SuiteReact-Proxy-Token/);
  }

  for (const filePath of [
    'suitereact/src/legacy/components/NsReactFormGridElement/index.tsx',
    'suitereact/src/legacy/components/NsReactFormGridRow/index.tsx',
  ]) {
    const source = await readFile(filePath, 'utf8');
    assert.match(source, /apiToken\?: string/);
    assert.match(source, /apiToken=\{/);
  }
});

test('RESTlet failures do not disclose NetSuite exception details', async () => {
  const handler = await readFile(
    'sdf/scripts/sr_rl_rct_action_handler.ts',
    'utf8'
  );
  assert.match(handler, /errorResponse\(\s*'SUITEREACT_ACTION_FAILED'/);
  const catchBlock = handler.slice(handler.indexOf('} catch (e: any)'));
  assert.doesNotMatch(catchBlock, /pathOr\([^\n]*message/);
  assert.doesNotMatch(catchBlock, /JSON\.stringify\(e\)/);
});

test('Doc Spaces listings enforce access before returning metadata', async () => {
  const spaces = await readFile('sdf/actions/dsGetSpaces.ts', 'utf8');
  assert.match(spaces, /evaluateAccess\(\{ targetType: 'space'/);
  assert.match(spaces, /levelRank\(access\) < 1/);

  const docs = await readFile('sdf/actions/dsGetSpaceDocs.ts', 'utf8');
  assert.match(docs, /targetType: 'space'/);
  assert.match(docs, /levelRank\(access\) < 1/);

  const employees = await readFile('sdf/actions/dsGetEmployees.ts', 'utf8');
  assert.match(employees, /spaceId: string/);
  assert.match(employees, /levelRank\(access\) < 5/);

  const members = await readFile(
    'apps/doc-spaces/src/domain/views/MembersPanel.tsx',
    'utf8'
  );
  assert.match(members, /dsGetEmployees\(\{ spaceId: space\.id/);
});

test('published packages use the repository BSD-3-Clause license', async () => {
  const rootLicense = await readFile('LICENSE', 'utf8');
  const suiteReactLicense = await readFile('suitereact/LICENSE', 'utf8');
  const mcpLicense = await readFile('mcp/LICENSE', 'utf8');
  assert.equal(suiteReactLicense.trimEnd(), rootLicense.trimEnd());
  assert.equal(mcpLicense.trimEnd(), rootLicense.trimEnd());
});

test('package contents and publication are enforced by repository automation', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(
    packageJson.scripts['check:packages'],
    'node deploy/validate-package-contents.mjs && node deploy/validate-package-consumers.mjs'
  );

  const validator = await readFile(
    'deploy/validate-package-contents.mjs',
    'utf8'
  );
  assert.match(validator, /allowedRoots/);
  assert.match(validator, /required/);
  assert.match(validator, /unexpected/);

  const release = await readFile('.github/workflows/release.yml', 'utf8');
  assert.match(release, /environment: npm-publish/);
  assert.match(release, /npm run check:packages/);
  assert.match(release, /npm publish --workspace=suitereact/);
  assert.match(release, /npm publish --workspace=mcp-server-netsuite/);
});
