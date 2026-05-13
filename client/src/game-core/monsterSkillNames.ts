/**
 * Monster Skill Name Registry
 *
 * Single source of truth mapping every monster-skill trigger key
 * (`MonsterSkillKey`) to its Chinese display name. Used by the
 * "skill triggered" floating animation that pauses the pipeline
 * until the player has seen the skill name above the monster card.
 *
 * Adding a new monster effect is only safe if you also add a
 * matching `MonsterSkillKey` here AND register a name in
 * `getMonsterSkillName`. The exhaustive switch + `assertNever`
 * compile-time check forces this. See:
 *   .cursor/rules/shared-effect-id-impact-check.mdc
 */

export type MonsterSkillKind =
  | 'enter'
  | 'death'
  | 'bleed'
  | 'attack'
  | 'turnEnd'
  | 'heroTurnEnd'
  | 'reflect'
  | 'passive'
  | 'waterfall'
  | 'spawn';

export type MonsterSkillKey =
  // 入场
  | 'enter:auto-engage'
  | 'enter:ogreEnterDiscard'
  // 死亡 / 遗言 / 复活
  | 'death:lastWords:discardHand'
  | 'death:lastWords:wraithHaunt'
  | 'death:lastWords:skeleton'
  | 'death:lastWords:generic'
  | 'death:revive'
  // 流血时附带
  | 'bleed:gainAttack'
  // 攻击时附带
  | 'attack:goblinSteal'
  | 'attack:goblinStealCard'
  | 'attack:swarmCorrode'
  | 'attack:ogreStun'
  | 'attack:eliteDoubleAttack'
  // 反击 / 受击反应
  | 'reflect:antiMagic'
  | 'reflect:dragonBleedDestroy'
  | 'reflect:dragonBreath'
  | 'reflect:bossRetaliation'
  // 怪物回合结束
  | 'turnEnd:wraithAura'
  | 'turnEnd:wraithTurnEnrage'
  | 'turnEnd:wraithSelfAttack'
  | 'turnEnd:wraithDestroyAmulet'
  | 'turnEnd:goblinStackHeal'
  | 'turnEnd:goblinStealEquip'
  | 'turnEnd:golemSpellGrowth'
  // 英雄回合结束（行内怪物）
  | 'heroTurnEnd:eliteRegen'
  | 'heroTurnEnd:eliteHealOther'
  // 被动/全局
  | 'passive:swarmSpawn'
  | 'passive:swarmHordeRage'
  | 'passive:lowGoldEliteBuff'
  | 'passive:dragonScales'
  // 瀑布相关
  | 'waterfall:wraithEnrage';

/**
 * Static map: every key listed in `MonsterSkillKey` MUST have a name
 * and a kind. The exhaustive switch in `getMonsterSkillEntry` makes
 * this a compile-time check — adding a new key without registering
 * its display name fails `tsc --noEmit`.
 */
export interface MonsterSkillEntry {
  name: string;
  kind: MonsterSkillKind;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled MonsterSkillKey: ${String(x)}`);
}

export function getMonsterSkillEntry(key: MonsterSkillKey): MonsterSkillEntry {
  switch (key) {
    // 入场
    case 'enter:auto-engage':
      return { name: '入场·开战', kind: 'enter' };
    case 'enter:ogreEnterDiscard':
      return { name: '入场·震慑', kind: 'enter' };

    // 死亡 / 遗言 / 复活
    case 'death:lastWords:discardHand':
      return { name: '亡语·撕牌', kind: 'death' };
    case 'death:lastWords:wraithHaunt':
      return { name: '亡语·缠绕', kind: 'death' };
    case 'death:lastWords:skeleton':
      return { name: '亡语·骸弃', kind: 'death' };
    case 'death:lastWords:generic':
      return { name: '亡语·散音', kind: 'death' };
    case 'death:revive':
      return { name: '不朽·复生', kind: 'death' };

    // 流血时附带
    case 'bleed:gainAttack':
      return { name: '流血·狂怒', kind: 'bleed' };

    // 攻击时附带
    case 'attack:goblinSteal':
      return { name: '攻击·窃金', kind: 'attack' };
    case 'attack:goblinStealCard':
      return { name: '攻击·窃牌', kind: 'attack' };
    case 'attack:swarmCorrode':
      return { name: '攻击·腐蚀', kind: 'attack' };
    case 'attack:ogreStun':
      return { name: '攻击·震晕', kind: 'attack' };
    case 'attack:eliteDoubleAttack':
      return { name: '攻击·连击', kind: 'attack' };

    // 反击 / 受击反应
    case 'reflect:antiMagic':
      return { name: '反击·反魔', kind: 'reflect' };
    case 'reflect:dragonBleedDestroy':
      return { name: '反击·破甲', kind: 'reflect' };
    case 'reflect:dragonBreath':
      return { name: '反击·龙息', kind: 'reflect' };
    case 'reflect:bossRetaliation':
      return { name: '反击·反噬', kind: 'reflect' };

    // 怪物回合结束（成长）
    case 'turnEnd:wraithAura':
      return { name: '成长·光环', kind: 'turnEnd' };
    case 'turnEnd:wraithSelfAttack':
      return { name: '成长·蓄积', kind: 'turnEnd' };
    case 'turnEnd:wraithTurnEnrage':
      return { name: '成长·诅咒', kind: 'turnEnd' };
    case 'turnEnd:wraithDestroyAmulet':
      return { name: '成长·碎符', kind: 'turnEnd' };
    case 'turnEnd:goblinStackHeal':
      return { name: '成长·疗养', kind: 'turnEnd' };
    case 'turnEnd:goblinStealEquip':
      return { name: '成长·窃宝', kind: 'turnEnd' };
    case 'turnEnd:golemSpellGrowth':
      return { name: '成长·吞噬', kind: 'turnEnd' };

    // 英雄回合结束（增强）
    case 'heroTurnEnd:eliteRegen':
      return { name: '增强·再生', kind: 'heroTurnEnd' };
    case 'heroTurnEnd:eliteHealOther':
      return { name: '增强·庇护', kind: 'heroTurnEnd' };

    // 被动 / 全局
    case 'passive:swarmSpawn':
      return { name: '被动·繁殖', kind: 'passive' };
    case 'passive:swarmHordeRage':
      return { name: '被动·集结', kind: 'passive' };
    case 'passive:lowGoldEliteBuff':
      return { name: '被动·窘境', kind: 'passive' };
    case 'passive:dragonScales':
      return { name: '被动·龙鳞', kind: 'passive' };

    // 瀑布
    case 'waterfall:wraithEnrage':
      return { name: '瀑流·激怒', kind: 'waterfall' };

    default:
      return assertNever(key);
  }
}

export function getMonsterSkillName(key: MonsterSkillKey): string {
  return getMonsterSkillEntry(key).name;
}

export function getMonsterSkillKind(key: MonsterSkillKey): MonsterSkillKind {
  return getMonsterSkillEntry(key).kind;
}

/**
 * Visual animation duration. Shared by reducer (queue payload) and UI (CSS in
 * `index.css → @keyframes monster-skill-float-rise`). The float keeps floating
 * up + fading for this long.
 *
 * NOTE: this is NOT how long the pipeline pauses anymore — see
 * `SKILL_FLOAT_RELEASE_MS` below. The visual outlives the pipeline pause so
 * the animation looks normal but gameplay resumes earlier (no perceived lag).
 */
export const SKILL_FLOAT_DURATION_MS = 1400;

/**
 * How long the UI hook waits before dispatching `RELEASE_MONSTER_SKILL_FLOAT`
 * to unfreeze the action pipeline. Decoupled from the visual duration above
 * so the player still sees the full skill name animation while the game
 * continues running underneath.
 *
 * Tuned to be long enough that the player can read the skill name (well past
 * the 0%→15% intro of the keyframe = ~210ms) and short enough that chained
 * sequential skill floats (boss death → multi-passive cascades) stop feeling
 * like a multi-second freeze. Sequential floats now overlap visually: when
 * float #2 enters, it replaces float #1's element even though #1's CSS
 * animation hasn't finished yet — acceptable because the player has already
 * seen #1 long enough to read it.
 */
export const SKILL_FLOAT_RELEASE_MS = 500;
