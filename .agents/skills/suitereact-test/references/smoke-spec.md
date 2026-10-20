# App Smoke Specification

Place an app-owned specification at `apps/<app>/test/smoke.mjs` and export `runSmoke`:

```javascript
export async function runSmoke({
  page,
  live,
  step,
  screenshot,
  actionResponses,
}) {
  await step('critical controls', async () => {
    await page.getByRole('button', { name: 'Search' }).waitFor();
  });

  if (!live) return { dataLoaded: false };

  await step('load records', async () => {
    await page.getByRole('button', { name: 'Search' }).click();
    await page.locator('.MuiDataGrid-row').first().waitFor();
  });
  await screenshot('records-loaded');
  return { dataLoaded: true, metrics: { rowCount: 1 } };
}
```

Use accessible roles and labels. Exercise the app's primary workflow, not every visual element. Throw on incorrect behavior. Mutating workflows require an explicit environment and known test data; do not make them part of an autonomous default smoke test.
