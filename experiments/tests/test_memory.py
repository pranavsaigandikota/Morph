import io
import math
import unittest
from PIL import Image
from worldshift.memory import Navigation, inspect_image
from worldshift.scene_service import GenerateScene
from worldshift.memory_service import Restore
from pydantic import ValidationError

class NavigationTests(unittest.TestCase):
    def test_applied_forward_and_opposites(self):
        n=Navigation(1)
        n.apply(['w'],(0,0),1,1,1000,60)
        self.assertAlmostEqual(n.state['z'],1)
        n.apply(['w','s','a','d'],(0,0),2,1,2000,60)
        self.assertAlmostEqual(n.state['z'],1)
        self.assertEqual(n.state['control_seq'],2)
    def test_diagonal_normalized_and_turn(self):
        n=Navigation(1)
        n.apply(['w','d'],(0,0),1,1,1,60)
        self.assertAlmostEqual(math.hypot(n.state['x'],n.state['z']),1)
        n=Navigation(1)
        from worldshift.memory import YAW_GAIN, PAN_EXPONENT
        n.apply(['w'],((math.pi/4/YAW_GAIN)**(1/PAN_EXPONENT),0),1,1,1,60)
        self.assertAlmostEqual(n.state['x'],math.sqrt(.5))
        self.assertLess(n.state['confidence'],1)
    def test_uniform_is_rejected_not_certified_clean(self):
        b=io.BytesIO();Image.new('RGB',(80,80),'black').save(b,format='PNG')
        q=inspect_image(b.getvalue())
        self.assertEqual(q['status'],'invalid_uniform')
        self.assertFalse(q['approved'])
    def test_supported_requests_and_no_silent_fast_substitution(self):
        self.assertEqual(GenerateScene(prompt='A street',quality='high').steps,30)
        with self.assertRaises(ValidationError):
            GenerateScene(prompt='A street',quality='fast')
        with self.assertRaises(ValidationError):
            Restore(session_id='s',checkpoint_id='c',variant='mock')

if __name__=='__main__':unittest.main()
