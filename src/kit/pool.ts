import { meshLevels, type GridLike, type MeshArrays } from './meshcore';

/**
 * A small pool of mesh workers. Falls back to meshing on the main thread when workers are not
 * available (or when `sync` is set), so callers never need to care.
 */
export class MeshPool {
  private workers: Worker[] = [];
  private next = 0;
  private pending = new Map<number, { resolve: (m: MeshArrays[]) => void; grid: GridLike; origin: [number, number, number]; lods: boolean }>();
  private id = 0;
  private failed = false;

  constructor(private size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {}

  private worker(): Worker | null {
    if (this.failed || typeof Worker === 'undefined') return null;
    if (this.workers.length < this.size) {
      try {
        const w = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ id: number; levels: MeshArrays[] }>) => {
          const job = this.pending.get(e.data.id);
          this.pending.delete(e.data.id);
          job?.resolve(e.data.levels);
        };
        w.onerror = (err) => {
          console.warn('mesh worker failed, meshing on the main thread', err);
          this.failed = true;
          // Finish everything still waiting, here.
          for (const [id, job] of this.pending) {
            this.pending.delete(id);
            job.resolve(meshLevels(job.grid, job.origin, job.lods));
          }
        };
        this.workers.push(w);
        return w;
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.workers[this.next++ % this.workers.length];
  }

  /** Mesh a grid (copied to the worker, so the caller's grid stays usable). */
  mesh(grid: GridLike, origin: [number, number, number], lods: boolean, sync = false): Promise<MeshArrays[]> {
    const w = sync ? null : this.worker();
    if (!w) return Promise.resolve(meshLevels(grid, origin, lods));
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, grid, origin, lods });
      const plain: GridLike = { data: grid.data, sx: grid.sx, sy: grid.sy, sz: grid.sz };
      w.postMessage({ id, grid: plain, origin, lods });
    });
  }

  get busy() {
    return this.pending.size;
  }

  dispose() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }
}
