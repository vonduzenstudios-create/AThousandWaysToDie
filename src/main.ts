import { RAPIER } from './physics';
import { Game } from './game';

async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  (window as unknown as { game: Game }).game = game;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:10px;left:10px">Failed to start: ${String(e)}</pre>`);
});
