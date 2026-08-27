/**
 * Next.js instrumentation hook. Runs once when the Node.js server process
 * starts. It launches the StellarWorker background loop.
 *
 * The worker is intentionally not started in the Edge runtime; it is a
 * long-lived Node.js process that resubmits signed payloads and reconciles
 * in-flight operations.
 */
export async function register() {
  // Edge runtime does not support the Node.js APIs used by the worker.
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  const { stellarWorkerManager } = await import(
    './infrastructure/stellar/StellarWorkerManager'
  );
  stellarWorkerManager.start();
}
