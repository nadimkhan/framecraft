# Remotion Animation & Transition Guide

## Scene Animations (Within Each Scene)

These animations play continuously throughout a scene's duration:

### Scene 0 (Intro)
- **NO ANIMATION** - Static image only
- Soft wipe from right

### Scene 1+ Animations (16 types)

| Animation | Description |
|-----------|-------------|
| `zoom-in` | Gradual zoom from 1x to 1.25x |
| `zoom-out` | Gradual zoom out from 1.2x to 1x |
| `pan-left` | Camera pans left with slight zoom |
| `pan-right` | Camera pans right with slight zoom |
| `pan-up` | Camera pans up with slight zoom |
| `pan-down` | Camera pans down with slight zoom |
| `ken-burns` | Classic documentary style: slow zoom + pan across image |
| `spiral-zoom` | Zoom with subtle rotation (0° → 5° → 0°) |
| `pulse-breathe` | Rhythmic breathing/pulsing effect |
| `drift-diagonal` | Smooth diagonal drift across image |
| `focus-pull` | Zoom in then out (cinematic focus effect) |
| `orbit-light` | Orbital movement around center point |
| `slow-scale-rotate` | Gentle zoom with 3° rotation |
| `parallax-layer` | Multi-directional layered movement |
| `subtle-float` | Gentle floating motion |
| `cinematic-push` | Dramatic zoom from 1.05x to 1.2x |

---

## Scene Transitions (Between Scenes)

**ONLY SOFT-WIPE WITH ALTERNATING DIRECTIONS**:

| Scene | Wipe Direction |
|-------|----------------|
| 0 → 1 | Right → Left |
| 1 → 2 | Left → Right |
| 2 → 3 | Up → Down |
| 3 → 4 | Down → Up |
| 4 → 5 | Right → Left |
| ... | Cycle repeats |

### How Soft-Wipe Works
- **No scale changes** - eliminates jerky zoom
- **Clip-path wipe** - clean edge transition
- **Subtle brightness** - slight dim during transition for smooth feel
- **Alternating directions** - right, left, up, down, then repeats

---

## How It Works

### Animation Assignment
- **Scene 0 (intro)**: `none` - completely static
- **Scene 1+**: Auto-assigned from 16-animation pool using rotation

### Transition Assignment
- **All scenes**: Use soft-wipe with alternating directions
- Scene 0 starts with 'right' direction

### Timing
- Scene animations: Play continuously throughout each scene
- Transitions: Occur during audio's trailing silence (overlap period)

---

## Files

- `remotion/components/AnimationEngine.tsx` - Scene animations
- `remotion/components/Scene.tsx` - Scene transitions with wipe directions
- `remotion/types.ts` - Type definitions (includes WipeDirection)
- `remotion/utils/timeline.ts` - Timeline builder with wipe directions
- `scripts/windows-renderer/render-gpu.js` - Windows GPU renderer
