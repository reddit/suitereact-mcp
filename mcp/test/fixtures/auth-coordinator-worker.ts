import fs from 'node:fs';

import { OAuthCoordinator } from '../../src/auth/auth-coordinator.js';

const [lockFile, failureFile, staleFile, pause] = process.argv.slice(2);
if (pause === 'pause') {
  const unlink = fs.unlinkSync;
  fs.unlinkSync = file => {
    if (String(file) === staleFile) {
      process.send?.({ event: 'stale-observed' });
      fs.readSync(0, Buffer.alloc(1), 0, 1, null);
    }
    return unlink(file);
  };
}

const coordinator = new OAuthCoordinator({ lockFile, failureFile });
try {
  await coordinator.run(async () => {
    process.send?.({ event: 'acquired' });
    await new Promise<void>(resolve =>
      process.once('message', () => resolve())
    );
    return 'done';
  });
  process.send?.({ event: 'released' });
} catch (error) {
  process.send?.({ event: 'denied', message: (error as Error).message });
}
process.disconnect();
