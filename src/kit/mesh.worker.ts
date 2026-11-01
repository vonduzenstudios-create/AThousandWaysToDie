/// <reference lib="webworker" />
import { meshLevels, buffersOf, type GridLike } from './meshcore';

/** Meshes building grids off the main thread. Message: { id, grid, origin, lods }. */
self.onmessage = (e: MessageEvent<{ id: number; grid: GridLike; origin: [number, number, number]; lods: boolean }>) => {
  const { id, grid, origin, lods } = e.data;
  const levels = meshLevels(grid, origin, lods);
  (self as unknown as Worker).postMessage({ id, levels }, buffersOf(levels));
};
