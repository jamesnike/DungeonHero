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
  | 'bleed:swarmCorrode'
  // 攻击时附带
  | 'attack:goblinSteal'
  | 'attack:goblinStealCard'
  | 'attack:swarmCorrode'
  | 'attack:ogreStun'
  | 'attack:eliteDoubleAttack'
  | 'attack:bossRetaliation'
  | 'attack:dragonBreath'
  | 'attack:critChain'
  // 反制玩家
  | 'reflect:antiMagic'
  | 'reflect:golemReflect'
  | 'reflect:dragonBleedDestroy'
  // 怪物回合结束
  | 'turnEnd:wraithAura'
  | 'turnEnd:wraithTurnEnrage'
  | 'turnEnd:wraithSelfAttack'
  | 'turnEnd:wraithDestroyAmulet'
  | 'turnEnd:goblinStackHeal'
  | 'turnEnd:goblinStealEquip'
  | 'turnEnd:golemSpellGrowth'
  | 'turnEnd:bossLastStandAura'
  // 英雄回合结束（行内怪物）
  | 'heroTurnEnd:eliteRegen'
  | 'heroTurnEnd:eliteHealOther'
  // 被动/全局
  | 'passive:swarmSpawn'
  | 'passive:swarmHordeRage'
  | 'passive:lowGoldEliteBuff'
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
      return { name: '入场·全军激怒', kind: 'enter' };
    case 'enter:ogreEnterDiscard':
      return { name: '入场·蛮力震慑', kind: 'enter' };

    // 死亡 / 遗言 / 复活
    case 'death:lastWords:discardHand':
      return { name: '亡语·撕碎手牌', kind: 'death' };
    case 'death:lastWords:wraithHaunt':
      return { name: '亡语·怨灵缠绕', kind: 'death' };
    case 'death:lastWords:skeleton':
      return { name: '亡语·骸骨弃手', kind: 'death' };
    case 'death:lastWords:generic':
      return { name: '亡语', kind: 'death' };
    case 'death:revive':
      return { name: '不朽·复活', kind: 'death' };

    // 流血时附带
    case 'bleed:gainAttack':
      return { name: '负伤狂怒·攻击+', kind: 'bleed' };
    case 'bleed:swarmCorrode':
      return { name: '虫群腐蚀·受击附带', kind: 'bleed' };

    // 攻击时附带
    case 'attack:goblinSteal':
      return { name: '攻击·窃宝', kind: 'attack' };
    case 'attack:goblinStealCard':
      return { name: '攻击·夺牌', kind: 'attack' };
    case 'attack:swarmCorrode':
      return { name: '攻击·腐蚀', kind: 'attack' };
    case 'attack:ogreStun':
      return { name: '攻击·震晕', kind: 'attack' };
    case 'attack:eliteDoubleAttack':
      return { name: '攻击·双连击', kind: 'attack' };
    case 'attack:bossRetaliation':
      return { name: 'BOSS·反伤', kind: 'attack' };
    case 'attack:dragonBreath':
      return { name: '龙息', kind: 'attack' };
    case 'attack:critChain':
      return { name: '攻击·暴击链', kind: 'attack' };

    // 反制玩家
    case 'reflect:antiMagic':
      return { name: '金身·反魔', kind: 'reflect' };
    case 'reflect:golemReflect':
      return { name: '傀儡·法术反射', kind: 'reflect' };
    case 'reflect:dragonBleedDestroy':
      return { name: '龙血摧毁', kind: 'reflect' };

    // 怪物回合结束
    case 'turnEnd:wraithAura':
      return { name: '幽魂光环', kind: 'turnEnd' };
    case 'turnEnd:wraithTurnEnrage':
      return { name: '幽魂·回合激怒', kind: 'turnEnd' };
    case 'turnEnd:wraithSelfAttack':
      return { name: '幽魂·怨念蓄积', kind: 'turnEnd' };
    case 'turnEnd:wraithDestroyAmulet':
      return { name: '幽魂·摧毁护符', kind: 'turnEnd' };
    case 'turnEnd:goblinStackHeal':
      return { name: '哥布林·贼窝疗养', kind: 'turnEnd' };
    case 'turnEnd:goblinStealEquip':
      return { name: '哥布林·窃宝', kind: 'turnEnd' };
    case 'turnEnd:golemSpellGrowth':
      return { name: '傀儡·魔法成长', kind: 'turnEnd' };
    case 'turnEnd:bossLastStandAura':
      return { name: 'BOSS·背水光环', kind: 'turnEnd' };

    // 英雄回合结束
    case 'heroTurnEnd:eliteRegen':
      return { name: '精英·再生', kind: 'heroTurnEnd' };
    case 'heroTurnEnd:eliteHealOther':
      return { name: '精英·治疗友军', kind: 'heroTurnEnd' };

    // 被动 / 全局
    case 'passive:swarmSpawn':
      return { name: '虫群繁殖', kind: 'passive' };
    case 'passive:swarmHordeRage':
      return { name: '虫群集结', kind: 'passive' };
    case 'passive:lowGoldEliteBuff':
      return { name: '精英·窘境强化', kind: 'passive' };

    // 瀑布
    case 'waterfall:wraithEnrage':
      return { name: '幽魂·瀑流激怒', kind: 'waterfall' };

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
