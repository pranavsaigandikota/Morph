"""World Memory API v1.1 additive behaviour. CPU-only: a fake service stands in for the GPU loop."""
import asyncio
import io
import math
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image
from pydantic import ValidationError

from worldshift.memory import Memory, Navigation, NAV_MODEL
from worldshift.memory_service import Save, Review


def jpeg(color=(90, 120, 150)):
    image = Image.new('RGB', (64, 36), color)
    for x in range(0, 64, 4):
        image.putpixel((x, x % 36), (250, 250, 250))  # avoid the uniform-image rejection
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    return buffer.getvalue()


class LoggingQueue(asyncio.Queue):
    """Memory.emit writes with put_nowait directly; log every item in arrival order."""
    def __init__(self, log):
        super().__init__()
        self.log = log

    def put_nowait(self, item):
        self.log.append(item)
        super().put_nowait(item)


class FakeSubscriber:
    def __init__(self):
        self.log = []
        self.queue = LoggingQueue(self.log)

    def put(self, item):
        self.queue.put_nowait(item)

    def clear(self):
        while not self.queue.empty():
            self.queue.get_nowait()


class FakeService:
    def __init__(self):
        self.epoch = 1
        self.status = 'running'
        self.session = {'id': 's1'}
        self.lifecycle_lock = asyncio.Lock()
        self.gpu_lock = asyncio.Lock()
        self.wake = asyncio.Event()
        self.sub = FakeSubscriber()
        self.subscribers = {'c': self.sub}
        self.backend = SimpleNamespace(restore_anchor=lambda path, prompt: None)
        self.emitted = []

    def find(self, sid):
        if sid != self.session['id']:
            raise KeyError(sid)

    def clear_controls(self):
        pass

    async def gpu(self, fn, *args):
        return fn(*args)


class LiveMemoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        seed = root / 'seed.jpg'
        seed.write_bytes(jpeg((40, 80, 40)))
        self.s = FakeService()
        self.m = Memory(self.s, root)
        # Record the service epoch at each emit, to check the K3 invariant.
        self.m.emit = self._emit_via(self.m.emit)
        await self.m.begin(seed, SimpleNamespace(prompt='Florida street'))

    def _emit_via(self, emit):
        def wrapped(kind, payload):
            before = len(self.s.sub.log)
            emit(kind, payload)
            for item in self.s.sub.log[before:]:
                self.s.emitted.append((item['type'], item['epoch'], self.s.epoch))
        return wrapped

    async def asyncTearDown(self):
        self.tmp.cleanup()

    def frame(self, frame_id=10):
        meta = {'frame_id': frame_id, 'seq': frame_id, 'epoch': self.s.epoch, 'generated_at_ms': 1.0, 'batch_id': frame_id}
        self.m.batch(jpeg(), meta, ['w'], (5.0, 0.0), 4)

    async def test_seed_and_capture_reasons(self):
        seed = self.m.world['checkpoints'][0]
        self.assertEqual(seed['capture_reason'], 'initial_seed')
        self.assertIsNone(seed['calibration'])
        self.frame()
        manual = await self.m.save('Saved view')
        self.assertEqual(manual['capture_reason'], 'manual')
        cal = await self.m.save('Look right', capture_reason='calibration',
                                calibration={'calibration_id': 'k3x9q2m7', 'kind': 'capture', 'soft_label': 'right'})
        self.assertEqual(cal['capture_reason'], 'calibration')
        self.assertEqual(cal['calibration']['soft_label'], 'right')
        # Calibration capture never implies recovery-anchor approval.
        self.assertFalse(cal['quality']['reviewed'])
        self.assertFalse(cal['quality']['approved'])
        self.assertEqual(len(cal['image_sha256']), 64)
        with self.assertRaises(ValueError):
            await self.m.save('bad', capture_reason='automatic_turn')

    async def test_review_metadata(self):
        cid = self.m.world['checkpoints'][0]['checkpoint_id']
        cp = await self.m.review(cid, False, 'tester', 'blurry')
        self.assertEqual(cp['quality'], {**cp['quality'], 'reviewed': True, 'approved': False})
        self.assertEqual(cp['review']['reviewer'], 'tester')
        self.assertEqual(cp['review']['reason'], 'blurry')
        self.assertIsNotNone(cp['review']['reviewed_at'])

    async def test_reposition_anchor_and_segment(self):
        first = self.m.nav.state['segment_id']
        self.assertEqual(self.m.nav.state['anchor_kind'], 'world_start')
        seed = self.m.world['checkpoints'][0]
        self.m.reposition(seed, 'reset_to_seed')
        state = self.m.nav.state
        self.assertNotEqual(state['segment_id'], first)
        self.assertEqual(state['relationship'], 'restored_view')
        self.assertEqual(state['anchor_kind'], 'reset_to_seed')
        self.assertEqual(state['restored_from_checkpoint_id'], seed['checkpoint_id'])
        self.assertEqual(self.m.trajectory[-1]['segment_id'], state['segment_id'])
        # Anchor fields persist through movement within the segment.
        self.frame(20)
        self.assertEqual(self.m.nav.state['anchor_kind'], 'reset_to_seed')

    async def test_navigation_since_handles_overflow(self):
        for _ in range(2100):
            self.m.append_trajectory({'x': 0})
        self.assertEqual(self.m.trajectory_total, 2100)
        full = self.m.navigation_since(0)
        self.assertEqual(full['trajectory_offset'], 2100 - 2048)
        self.assertEqual(len(full['trajectory']), 2048)
        tail = self.m.navigation_since(2095)
        self.assertEqual(tail['trajectory_offset'], 2095)
        self.assertEqual(len(tail['trajectory']), 5)
        self.assertEqual(self.m.navigation_since(9999)['trajectory'], [])
        snap = self.m.snapshot()
        self.assertEqual(snap['trajectory_total'], 2100)
        self.assertEqual(snap['nav_model']['source'], 'nominal_constant')
        self.assertEqual(snap['nav_model']['turn_gain'], 'not_established')

    async def test_restore_event_epoch_invariant(self):
        """K3: every memory event carries the live service epoch; status precedes recovery_completed."""
        self.frame()
        cp = await self.m.save('Anchor')
        await self.m.review(cp['checkpoint_id'], True)
        self.s.emitted.clear(); self.s.sub.log.clear()
        req = SimpleNamespace(session_id='s1', checkpoint_id=cp['checkpoint_id'], variant='raw', accept_unreviewed=False)
        result = await self.m.restore(req)
        self.assertEqual(result['epoch'], 2)
        for kind, event_epoch, service_epoch in self.s.emitted:
            self.assertEqual(event_epoch, service_epoch, kind)
        types = [item['type'] for item in self.s.sub.log]
        self.assertLess(types.index('status'), types.index('recovery_completed'))
        status = next(item for item in self.s.sub.log if item['type'] == 'status')
        self.assertEqual(status['epoch'], 2)
        self.assertEqual(self.m.nav.state['restored_from_checkpoint_id'], cp['checkpoint_id'])
        self.assertEqual(self.m.nav.state['anchor_kind'], 'checkpoint_restore')

    async def test_unreviewed_restore_refused(self):
        self.frame()
        cp = await self.m.save('Not reviewed')
        req = SimpleNamespace(session_id='s1', checkpoint_id=cp['checkpoint_id'], variant='raw', accept_unreviewed=False)
        with self.assertRaises(Exception) as ctx:
            await self.m.restore(req)
        self.assertEqual(getattr(ctx.exception, 'status_code', None), 409)


class RequestModelTests(unittest.TestCase):
    def test_calibration_requires_reason(self):
        Save(session_id='s', capture_reason='calibration', calibration={'calibration_id': 'abc123', 'soft_label': 'left'})
        with self.assertRaises(ValidationError):
            Save(session_id='s', capture_reason='calibration')
        with self.assertRaises(ValidationError):
            Save(session_id='s', calibration={'calibration_id': 'abc123'})

    def test_soft_label_is_closed_vocabulary_without_angles(self):
        with self.assertRaises(ValidationError):
            Save(session_id='s', capture_reason='calibration', calibration={'calibration_id': 'abc123', 'soft_label': '90deg'})
        with self.assertRaises(ValidationError):
            Save(session_id='s', capture_reason='calibration', calibration={'calibration_id': 'abc123', 'yaw_deg': 90})
        with self.assertRaises(ValidationError):
            Save(session_id='s', capture_reason='periodic')  # server-only reason

    def test_review_fields_bounded(self):
        Review(session_id='s', approved=True)
        with self.assertRaises(ValidationError):
            Review(session_id='s', approved=True, reason='x' * 201)


class NominalConstantsTests(unittest.TestCase):
    def test_constants_unchanged(self):
        self.assertEqual(NAV_MODEL['yaw_rad_per_unit'], .002)
        n = Navigation(1)
        n.apply(['w'], (math.pi / 4 / .002, 0), 1, 1, 1, 60)
        self.assertAlmostEqual(n.state['x'], math.sqrt(.5))


if __name__ == '__main__':
    unittest.main()
