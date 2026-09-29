export async function register() {
  // Node.js runtime only; one worker per process (ADR 0001).
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SLA_WORKER !== 'off') {
    const { startSlaWorker } = await import('@/server/worker/sla-sweep');
    startSlaWorker();
  }
}
