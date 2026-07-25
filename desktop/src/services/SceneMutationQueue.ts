/**
 * SceneMutationQueue.ts — Global serialization queue for OBS scene graph mutations.
 *
 * Any operation that modifies OBS scene state (creating scenes, toggling source
 * visibility, cloning, pushing overlays) MUST go through this queue. Read-only
 * operations (GetVersion, GetStats, GetSceneList) remain concurrent.
 *
 * The queue is a simple FIFO: each mutation awaits the previous one's completion
 * before executing. This prevents interleaving of OBS calls that corrupt the
 * scene graph and cause SIGSEGV crashes.
 *
 * Logging:
 *   [MUTATION START] <opId> <name> <timestamp>
 *   [MUTATION END]   <opId> <name> <elapsedMs>
 *   [MUTATION DURATION] <opId> <name> <elapsedMs>
 *   [MUTATION OVERLAP DETECTED] <name> — logged if two mutations overlap (should never happen)
 */

// ---------------------------------------------------------------------------
// Singleton queue
// ---------------------------------------------------------------------------

let _tail: Promise<void> = Promise.resolve();
let _opCounter = 0;
let _activeOps = new Set<string>(); // names of currently executing ops (for overlap detection)

/**
 * Enqueue a scene-graph mutation. Returns the result of `task`.
 *
 * Usage:
 *   const result = await sceneMutationQueue.enqueue("pushBible", async () => {
 *     // ... OBS calls that mutate scene state ...
 *     return "done";
 *   });
 */
export async function enqueueMutation<T>(name: string, task: () => Promise<T>): Promise<T> {
  const opId = ++_opCounter;
  const tag = `[${opId}] ${name}`;

  // Chain onto the current tail
  const previous = _tail.catch(() => undefined);
  let release!: () => void;
  _tail = previous.then(() => new Promise<void>((resolve) => {
    release = resolve;
  }));

  await previous;

  // Check for overlap (should never happen if queue is used correctly)
  for (const active of _activeOps) {
    console.warn(`[MUTATION OVERLAP DETECTED] "${name}" started while "${active}" is still running — queue bug?`);
  }
  _activeOps.add(name);

  const t0 = Date.now();
  const ts = new Date().toISOString();
  console.log(`[MUTATION START] ${tag} ${ts}`);

  try {
    const result = await task();
    const elapsed = Date.now() - t0;
    console.log(`[MUTATION END] ${tag} ${elapsed}ms`);
    console.log(`[MUTATION DURATION] ${tag} ${elapsed}ms`);
    return result;
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MUTATION END] ${tag} FAILED ${elapsed}ms: ${msg}`);
    console.log(`[MUTATION DURATION] ${tag} ${elapsed}ms (FAILED)`);
    throw err;
  } finally {
    _activeOps.delete(name);
    release();
  }
}

/**
 * Get the number of mutations currently waiting or executing.
 * Useful for diagnostics and stress testing.
 */
export function getPendingMutationCount(): number {
  return _activeOps.size;
}

/**
 * Get the current operation counter (total mutations enqueued since module load).
 * Useful for diagnostics.
 */
export function getMutationOpCounter(): number {
  return _opCounter;
}
