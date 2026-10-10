import type { WorldStyle } from '../services/sceneGeneration'

export interface CodexPreset {
  presetName: string
  title: string
  prompt: string
  style: WorldStyle | string
  generationSeed: number
  sceneId: string
  /** Local preview shipped in-repo (works offline). */
  localImageUrl: string
}

const TITLES: Record<string, string> = {
  'cyberpunk-city': 'Cyberpunk city',
  'enchanted-forest': 'Enchanted forest',
  'alien-planet': 'Alien planet',
  'underwater-base': 'Underwater base',
  'floating-islands': 'Floating islands',
  'florida-hurricane': 'Florida hurricane neighborhood',
}

/** Six SDXL HQ presets (1280x720, 30 steps) regenerated on the native-720p backend with the original prompts, styles and seeds. */
export const CODEX_PRESETS: CodexPreset[] = [
  {
    presetName: 'cyberpunk-city',
    title: TITLES['cyberpunk-city']!,
    prompt: 'A neon cyberpunk city street with rain and glowing signs',
    style: 'cinematic',
    generationSeed: 101,
    sceneId: '83998f85bc22469f8e6f06761a8368f4',
    localImageUrl: '/presets/codex/cyberpunk-city.jpg',
  },
  {
    presetName: 'enchanted-forest',
    title: TITLES['enchanted-forest']!,
    prompt: 'An enchanted forest path with luminous mushrooms and ancient trees',
    style: 'fantasy',
    generationSeed: 102,
    sceneId: '84bb70f7b4fd40b78f7e124c11ac9181',
    localImageUrl: '/presets/codex/enchanted-forest.jpg',
  },
  {
    presetName: 'alien-planet',
    title: TITLES['alien-planet']!,
    prompt: 'An alien planet canyon with violet rocks and two moons',
    style: 'stylized',
    generationSeed: 103,
    sceneId: 'f42693e61ab74c29ae1f1c76081db004',
    localImageUrl: '/presets/codex/alien-planet.jpg',
  },
  {
    presetName: 'underwater-base',
    title: TITLES['underwater-base']!,
    prompt: 'An underwater base corridor with glass walls and coral outside',
    style: 'cinematic',
    generationSeed: 104,
    sceneId: '363a394cda29459f9eecdf95061036ff',
    localImageUrl: '/presets/codex/underwater-base.jpg',
  },
  {
    presetName: 'floating-islands',
    title: TITLES['floating-islands']!,
    prompt: 'A stone footbridge between floating islands above clouds',
    style: 'fantasy',
    generationSeed: 105,
    sceneId: 'dfa221a95bce4183ab467f00b539145a',
    localImageUrl: '/presets/codex/floating-islands.jpg',
  },
  {
    presetName: 'florida-hurricane',
    title: TITLES['florida-hurricane']!,
    prompt: 'A Florida neighborhood after a hurricane, damaged palms, houses and debris',
    style: 'photorealistic',
    generationSeed: 106,
    sceneId: '6b14e080bf9e485c82415f1b7819d446',
    localImageUrl: '/presets/codex/florida-hurricane.jpg',
  },
]
