/**
 * Creates the ELK layout engine. ELK runs in a Web Worker, so that laying out a large graph does not
 * freeze the window. The worker is created from a Blob holding ELK's worker script: this works both
 * in the Electron app (loaded from file://, where workers from files are not allowed) and on the Web.
 * If a worker cannot be created, ELK runs on the main thread instead.
 */
import type { ELK } from 'elkjs/lib/elk-api';

let engine: Promise<ELK> | null = null;

export function getLayoutEngine(): Promise<ELK> {
  engine ??= createEngine().catch((e: unknown) => {
    engine = null; // Try again next time.
    throw e;
  });
  return engine;
}

async function createEngine(): Promise<ELK> {
  try {
    const [{ default: ElkApi }, { default: workerSource }] = await Promise.all([
      import('elkjs/lib/elk-api.js'),
      import('elkjs/lib/elk-worker.min.js?raw'),
    ]);
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const elk = new ElkApi({ workerUrl: url, workerFactory: (u) => new Worker(u!) });
    // Make sure the worker actually runs (e.g. it is not blocked by a security policy).
    await withTimeout(elk.layout({ id: 'probe', children: [{ id: 'a', width: 1, height: 1 }] }), 5000);
    return elk;
  } catch (e) {
    console.warn('ELK cannot run in a worker; running it on the main thread instead.', e);
    const { default: ElkBundled } = await import('elkjs/lib/elk.bundled.js');
    return new ElkBundled();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
