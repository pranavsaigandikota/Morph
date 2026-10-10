/** Preserve four-frame bursts; discard old work rather than buffering indefinitely. */
export const PRESENTATION_QUEUE_LIMIT = 4
export const PRESENTATION_MAX_AGE_MS = 140
export const PRESENTATION_FRAME_MS = 1000 / 30

export function takePresentationFrame<T extends {receivedAt:number;header:{epoch?:number}}>(
  queue:T[], at:number, epoch:number,
): {frame:T|undefined;skipped:number} {
  let skipped=0
  while(queue.length) {
    const first=queue[0]!
    const wrongEpoch=first.header.epoch!==undefined && first.header.epoch!==epoch
    if(!wrongEpoch && at-first.receivedAt<=PRESENTATION_MAX_AGE_MS)break
    queue.shift();skipped++
  }
  return {frame:queue.shift(),skipped}
}
