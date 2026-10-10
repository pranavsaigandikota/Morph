/**
 * Accurate Hugging Face model attribution for WorldShift.
 * LIVE / EXPERIMENTAL / MOCK must stay separated in the UI.
 */

export type ModelCapability = 'live' | 'experimental' | 'mock'

export interface HuggingFaceModelInfo {
  id: string
  name: string
  role: string
  capability: ModelCapability
  cardUrl: string
  notes: string
}

export const HUGGING_FACE_MODELS: HuggingFaceModelInfo[] = [
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    role: 'Image generation (Create Anything seed images)',
    capability: 'live',
    cardUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    notes: 'HQ starters target 1280×720 via experimental HIGH path; Turbo ≤4 steps is verified separately.',
  },
  {
    id: 'waypoint',
    name: 'Overworld Waypoint 1.5',
    role: 'Interactive first-person video exploration',
    capability: 'live',
    cardUrl: 'https://huggingface.co/Overworld/Waypoint-1.5-1B-360P',
    notes: 'Product visual target is native 1280×720 — awaiting Codex validated 720p contract. Card may still list 360P checkpoint names.',
  },
  {
    id: 'depth',
    name: 'Depth Anything V2',
    role: 'Experimental relative depth ranking',
    capability: 'experimental',
    cardUrl: 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small',
    notes: 'UI shows MOCK depth ranks until LIVE analysis is wired. Not metric depth.',
  },
  {
    id: 'owlvit',
    name: 'OWL-ViT',
    role: 'Experimental open-vocabulary object detection',
    capability: 'experimental',
    cardUrl: 'https://huggingface.co/google/owlvit-base-patch32',
    notes: 'Obstacle overlay uses MOCK observations by default; not collision geometry.',
  },
]
