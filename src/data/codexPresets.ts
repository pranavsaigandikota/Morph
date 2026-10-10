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

/** Six real SDXL presets from integration/codex-presets (Codex handoff). */
export const CODEX_PRESETS: CodexPreset[] = [
  {
    presetName: 'cyberpunk-city',
    title: TITLES['cyberpunk-city']!,
    prompt: 'A neon cyberpunk city street with rain and glowing signs',
    style: 'cinematic',
    generationSeed: 101,
    sceneId: '4ad2a74efccc4803adb9fdf620beb611',
    localImageUrl: '/presets/codex/cyberpunk-city.png',
  },
  {
    presetName: 'enchanted-forest',
    title: TITLES['enchanted-forest']!,
    prompt: 'An enchanted forest path with luminous mushrooms and ancient trees',
    style: 'fantasy',
    generationSeed: 102,
    sceneId: '425643379fe140f19b89edaa956fcb60',
    localImageUrl: '/presets/codex/enchanted-forest.png',
  },
  {
    presetName: 'alien-planet',
    title: TITLES['alien-planet']!,
    prompt: 'An alien planet canyon with violet rocks and two moons',
    style: 'stylized',
    generationSeed: 103,
    sceneId: '4265c807a9d845a4ab25c27fca2fe2f2',
    localImageUrl: '/presets/codex/alien-planet.png',
  },
  {
    presetName: 'underwater-base',
    title: TITLES['underwater-base']!,
    prompt: 'An underwater base corridor with glass walls and coral outside',
    style: 'cinematic',
    generationSeed: 104,
    sceneId: '525ada0610df41b4ade7a2a805f0693a',
    localImageUrl: '/presets/codex/underwater-base.png',
  },
  {
    presetName: 'floating-islands',
    title: TITLES['floating-islands']!,
    prompt: 'A stone footbridge between floating islands above clouds',
    style: 'fantasy',
    generationSeed: 105,
    sceneId: '6117e1e04e434c93999843ff19cf480d',
    localImageUrl: '/presets/codex/floating-islands.png',
  },
  {
    presetName: 'florida-hurricane',
    title: TITLES['florida-hurricane']!,
    prompt: 'A Florida neighborhood after a hurricane, damaged palms, houses and debris',
    style: 'photorealistic',
    generationSeed: 106,
    sceneId: '6a956ff381904a0cb91f2d068dd888b1',
    localImageUrl: '/presets/codex/florida-hurricane.png',
  },
]
