"""Analyse held-look trials. CPU only, offline, after GPU runs.

MEASURED: applied mouse per batch (server batches.jsonl), timings, frame counts.
INFERRED: image pan via numpy-FFT phase correlation (same method family as A0), pixel change, sharpness.
Pixels are NOT degrees. Visual judgements in the report are agent review, not human ratings.
Usage: python analyze_held_look.py <run_dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H = 160, 90
HANN = np.outer(np.hanning(H), np.hanning(W))


def gray(path):
    with Image.open(path) as im:
        return np.asarray(im.convert('L').resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0


def phase_corr(a, b):
    """Shift of b relative to a, in pixels at 160x90. +dx = content moved right."""
    fa = np.fft.fft2((a - a.mean()) * HANN)
    fb = np.fft.fft2((b - b.mean()) * HANN)
    r = fb * np.conj(fa)
    r /= np.abs(r) + 1e-9
    c = np.fft.ifft2(r).real
    iy, ix = np.unravel_index(np.argmax(c), c.shape)
    dy = iy if iy <= H // 2 else iy - H
    dx = ix if ix <= W // 2 else ix - W
    peak = float(c.max() / (c.std() + 1e-9))
    return int(dx), int(dy), peak


def laplacian_var(g):
    lap = g[1:-1, 2:] + g[1:-1, :-2] + g[2:, 1:-1] + g[:-2, 1:-1] - 4 * g[1:-1, 1:-1]
    return float(np.var(lap * 255))


def self_test():
    rng = np.random.default_rng(0)
    base = rng.random((H, W)).astype(np.float32)
    dx, dy, _ = phase_corr(base, np.roll(base, 5, axis=1))
    assert (dx, dy) == (5, 0), (dx, dy)


def analyse_trial(folder, server):
    trial = json.loads((folder / 'trial.json').read_text())
    rows = []
    for b in trial['batches']:
        s = server.get(b['batch_id'], {})
        mouse = s.get('mouse') or [0, 0]
        rows.append({**b, 'applied_mouse_dx': float(mouse[0]), 'server_frames': s.get('frames'),
                     'server_elapsed_s': s.get('elapsed_seconds'), 'inference_ms_server': s.get('inference_ms')})
    grays = [gray(folder / r['file']) for r in rows]
    hold = [i for i, r in enumerate(rows) if r['applied_mouse_dx'] != 0]
    # "before" = last batch generated with zero applied input before the first held batch.
    first_hold = hold[0] if hold else None
    before = max(0, (first_hold or len(rows) // 8) - 1)
    cum = 0.0
    for i, r in enumerate(rows):
        dx = dy = 0
        peak = None
        if i > 0:
            dx, dy, peak = phase_corr(grays[i - 1], grays[i])
        cum += dx
        r.update(pan_dx=dx, pan_dy=dy, pan_peak=peak, cum_pan_px=cum,
                 mad_vs_before=float(np.abs(grays[i] - grays[before]).mean()),
                 lap_ratio=laplacian_var(grays[i]) / max(1e-6, laplacian_var(grays[before])))
    cum_before = rows[before]['cum_pan_px']
    for r in rows:
        r['pan_from_before_px'] = r['cum_pan_px'] - cum_before
    applied = sum(abs(r['applied_mouse_dx']) for r in rows)
    last_hold = hold[-1] if hold else None
    out = {
        'name': trial['name'], 'strength_per_tick': trial['strength_per_tick'], 'direction': trial['direction'],
        'hold_s': trial['hold_s'], 'batches': len(rows), 'hold_batches_measured': len(hold),
        'applied_abs_mouse_total_measured': applied,
        'applied_mouse_per_hold_batch_median': float(np.median([abs(rows[i]['applied_mouse_dx']) for i in hold])) if hold else 0.0,
        'pan_end_of_hold_px': rows[last_hold]['pan_from_before_px'] if hold else None,
        'pan_end_of_trial_px': rows[-1]['pan_from_before_px'],
        'max_abs_pan_px': max(abs(r['pan_from_before_px']) for r in rows),
        'mad_end_of_hold': rows[last_hold]['mad_vs_before'] if hold else None,
        'mad_end_of_trial': rows[-1]['mad_vs_before'],
        'lap_ratio_end': rows[-1]['lap_ratio'],
        'lap_ratio_min': min(r['lap_ratio'] for r in rows[before:]),
        'received_fps': trial['frames_received'] / max(1e-6, (trial['end_ms'] - trial['first_frame_t']) / 1000),
    }
    # Generated FPS from the server's own batch log within this trial.
    el = [r['server_elapsed_s'] for r in rows if r['server_elapsed_s'] is not None]
    fr = sum(r['server_frames'] or 0 for r in rows[1:])
    out['generated_fps_server'] = fr / (el[-1] - el[0]) if len(el) > 1 and el[-1] > el[0] else None
    # Control-to-frame: first held control sent -> first received batch generated with held input (same client clock).
    if hold:
        out['control_to_first_held_frame_ms'] = rows[first_hold]['t_recv_ms'] - trial['hold_start_ms']
        release = next((i for i in range(last_hold + 1, len(rows))), None)
        out['release_to_first_zero_frame_ms'] = rows[release]['t_recv_ms'] - trial['hold_end_ms'] if release is not None else None
    out['_rows'] = rows
    out['_index'] = {'before': before, 'first_hold': first_hold, 'last_hold': last_hold}
    return out


def visible_response(res, noise):
    """First held batch whose cumulative pan exceeds the idle-noise threshold (INFERRED)."""
    rows, idx = res['_rows'], res['_index']
    if idx['first_hold'] is None:
        return None
    t0 = rows[idx['first_hold']]['t_recv_ms']
    for r in rows[idx['first_hold']:idx['last_hold'] + 1]:
        if abs(r['pan_from_before_px']) > noise:
            return r['t_recv_ms'] - t0
    return None


def contact_sheet(folder, res, path):
    rows, idx = res['_rows'], res['_index']
    n = len(rows)
    if idx['first_hold'] is None:
        picks = [0, n // 6, n // 3, n // 2, 2 * n // 3, 5 * n // 6, n - 1]
        labels = ['start'] + [f'{k}/6' for k in range(1, 6)] + ['end']
    else:
        a, b = idx['first_hold'], idx['last_hold']
        span = b - a
        picks = [idx['before'], a + span // 4, a + span // 2, a + 3 * span // 4, b, min(n - 1, b + (n - 1 - b) // 2), n - 1]
        labels = ['before', 'hold 25%', 'hold 50%', 'hold 75%', 'hold end', 'release+~1s', 'release+~2s']
    tw, th, pad = 320, 180, 34
    sheet = Image.new('RGB', (tw * len(picks), th + pad + 18), (12, 16, 22))
    d = ImageDraw.Draw(sheet)
    d.text((6, th + pad + 2), f"{res['name']}: {res['direction']} {res['strength_per_tick']}/tick, {res['hold_s']}s hold. Pan px are INFERRED image shift at 160px width, not degrees.", fill=(150, 160, 175))
    for k, (i, lab) in enumerate(zip(picks, labels)):
        r = rows[i]
        with Image.open(folder / r['file']) as im:
            sheet.paste(im.convert('RGB').resize((tw, th)), (k * tw, pad))
        d.text((k * tw + 4, 2), f"{lab}  sum|mouse|={sum(abs(x['applied_mouse_dx']) for x in rows[:i + 1]):.0f}", fill=(220, 225, 230))
        d.text((k * tw + 4, 16), f"pan {r['pan_from_before_px']:+.0f}px  change {r['mad_vs_before']:.3f}", fill=(140, 200, 190))
    sheet.save(path, quality=88)


def main(run_dir):
    self_test()
    run_dir = Path(run_dir)
    results = []
    for server_log in sorted(run_dir.glob('scene*-server-batches.jsonl')):
        scene = server_log.name.split('-')[0]
        server = {}
        for line in server_log.read_text().splitlines():
            row = json.loads(line)
            server[row['batch_id']] = row
        trials = []
        for folder in sorted(run_dir.glob(f'{scene}-*')):
            if folder.is_dir() and (folder / 'trial.json').exists():
                trials.append((folder, analyse_trial(folder, server)))
        idle = [r for _, r in trials if r['direction'] == 'none']
        noise = 2.0
        if idle:
            steps = [abs(x['pan_dx']) for x in idle[0]['_rows'][1:]]
            noise = max(2.0, 3 * float(np.std([x['pan_from_before_px'] for x in idle[0]['_rows']])))
            for _, r in trials:
                r['idle_drift_pan_end_px'] = idle[0]['pan_end_of_trial_px']
                r['idle_mad_end'] = idle[0]['mad_end_of_trial']
        for folder, r in trials:
            r['scene'] = scene
            r['visible_response_ms_inferred'] = visible_response(r, noise)
            r['noise_threshold_px'] = noise
            contact_sheet(folder, r, run_dir / f'{scene}-{r["name"]}-sheet.jpg')
            results.append(r)
    summary = [{k: v for k, v in r.items() if not k.startswith('_')} for r in results]
    (run_dir / 'analysis.json').write_text(json.dumps(summary, indent=2))
    cols = ['scene', 'name', 'applied_mouse_per_hold_batch_median', 'applied_abs_mouse_total_measured', 'pan_end_of_hold_px',
            'pan_end_of_trial_px', 'max_abs_pan_px', 'mad_end_of_trial', 'lap_ratio_min', 'generated_fps_server',
            'control_to_first_held_frame_ms', 'visible_response_ms_inferred']
    print(' | '.join(cols))
    for s in summary:
        print(' | '.join(f'{s.get(c):.3g}' if isinstance(s.get(c), float) else str(s.get(c)) for c in cols))


if __name__ == '__main__':
    main(sys.argv[1])
