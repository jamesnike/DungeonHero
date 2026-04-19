import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';
import type { RngState } from '@/game-core/rng';
import { pickRandom } from '@/game-core/rng';

export interface HeroVariant {
  id: string;
  name: string;
  classTitle: string;
  image: string;
}

export const heroVariants: HeroVariant[] = [
  {
    id: 'emberheart',
    name: 'Sir Alden Emberheart',
    classTitle: 'Knight',
    image: heroPortrait,
  },
  {
    id: 'ironwall',
    name: 'Lady Seraphine Ironwall',
    classTitle: 'Knight',
    image: heroPortrait,
  },
  {
    id: 'stormbane',
    name: 'Garrick Stormbane',
    classTitle: 'Knight',
    image: heroPortrait,
  },
  {
    id: 'swiftwind',
    name: 'Kaela Swiftwind',
    classTitle: 'Knight',
    image: heroPortrait,
  },
  {
    id: 'nightward',
    name: 'Thorne Nightward',
    classTitle: 'Knight',
    image: heroPortrait,
  },
];

export const getRandomHero = (rng: RngState): [HeroVariant, RngState] => {
  const [variant, nextRng] = pickRandom(heroVariants, rng);
  return [{ ...variant }, nextRng];
};

