// Thumbnails per shot (M4 W8), rendered from snapshots: the sequence world is put on each shot's thumbnail frame by
// @vrmxg/sequence's SequencePlayer (the nearest snapshot at or before it, then stepped: the exact world of a straight
// play), and drawn by @vrmxg/export's captureStill on either backend. Separate from the package's main entry
// (`@vrmxg/coverage/thumbnails`): it needs a render host, which Node doesn't have.
import { SequencePlayer } from '@vrmxg/sequence';
import { captureStill, hashFrame } from '@vrmxg/export';

/**
 * @param {{ tree: any, host: any, board: { shots: { id: string, name: string, frame: number }[] }, width?: number, height?: number, every?: number, player?: any, order?: 'film' | 'reverse' }} o
 *   tree: a sequence world (buildWorld on a composed sequence), at step 0 unless `player` is given; host: a RenderHost
 *   (an offline one: dprCap 1); board: storyboard()'s result; every: steps between snapshots; order: 'reverse' visits
 *   the shots last to first, so every seek restores a snapshot (the film order steps forward and takes them)
 * @returns {Promise<{ player: any, thumbs: { shot: string, name: string, frame: number, step: number, restored: number | null, width: number, height: number, rgba: Uint8ClampedArray, hash: string }[] }>}
 */
export async function renderThumbnails({ tree, host, board, width = 320, height = 180, every = 120, player = null, order = 'film' }) {
  if (host.tree !== tree) host.attach(tree);
  player ??= new SequencePlayer(tree, { every });
  const shots = order === 'reverse' ? [...board.shots].reverse() : board.shots;
  const thumbs = [];
  for (const s of shots) {
    const at = await player.seek(s.frame);
    const still = await captureStill(host, { width, height });
    thumbs.push({ shot: s.id, name: s.name, frame: s.frame, step: at.step, restored: at.restored, width, height, rgba: still.rgba, hash: hashFrame(new Uint8Array(still.rgba.buffer, still.rgba.byteOffset, still.rgba.byteLength)) });
  }
  if (order === 'reverse') thumbs.reverse();
  return { player, thumbs };
}
