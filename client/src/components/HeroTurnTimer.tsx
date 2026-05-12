import { memo, useEffect, useRef, useState } from 'react';
import { Hourglass, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallowGameState } from '@/hooks/useGameEngine';

/** 英雄回合 40 秒 wall-clock 倒计时窗口（无 boss 战）。 */
const HERO_TURN_DURATION_MS = 40_000;

/** Boss 战时的英雄回合倒计时窗口（活跃行有 `bossPhase: true` 怪物时启用）。
 *  Boss 战决策更复杂（多血层 / 强 retaliation / 全场 buff），玩家需要更多
 *  时间布局，给 100 秒。 */
const BOSS_HERO_TURN_DURATION_MS = 100_000;

/** 倒计时进入「警告」态（红色脉冲）的剩余阈值。 */
const LOW_TIME_WARNING_MS = 10_000;

/** 倒计时进入「危急」态（更亮的红色 + 加粗）的剩余阈值。 */
const CRITICAL_TIME_WARNING_MS = 5_000;

/**
 * Tick 频率。250ms 让最后几秒数字更新感觉跟手；1s 也行但末尾跳变会显得迟钝。
 */
const TICK_INTERVAL_MS = 250;

interface HeroTurnTimerProps {
  /**
   * 倒计时归零时调用。负责组件本地 useState modal 的 close + 引擎侧
   * `FORCE_END_HERO_TURN` dispatch。组件本身只做「计时 + 触发一次」。
   */
  onTimeout: () => void;
}

/**
 * 英雄回合 wall-clock 倒计时显示。
 *
 * 时长：默认 40 秒；当活跃行有 `bossPhase: true` 怪物时延长到 100 秒
 * （boss 战决策更复杂，给玩家更多时间布局）。
 *
 * 显示规则：仅在「战斗中且为英雄回合」可见——可见性匹配 `BoardOverlayButtons`
 * 里的 End Hero Turn 按钮，由 `state.playerTurnStartedAt` 直接驱动（START_TURN
 * / BEGIN_COMBAT 设置；END_TURN / FINISH_COMBAT 清空）。
 *
 * 行为：
 * - Wall-clock：用 `Date.now()` 与 `playerTurnStartedAt` 算剩余时间，永不暂停
 *   （包括 modal / 动画 / awaiting* 阶段）。**例外**：当 active row 有怪物
 *   处于击晕状态（`isStunned: true`）时，倒计时被 `playerTurnPausedAt` 冻结
 *   在击晕开始那一刻的剩余值；所有击晕解除后，`playerTurnStartedAt` 被
 *   reducer 重置为新的 `Date.now()`，倒计时回满（40 秒 / 100 秒）重新开始。
 * - 持久化：通过 `playerTurnStartedAt` + `playerTurnPausedAt` 持久化到
 *   localStorage，刷新页面后从原时间戳继续倒数；如果是在击晕暂停期间刷新，
 *   暂停时间戳也被还原，玩家看到的剩余时间跟刷新前一致。
 * - Boss 状态动态：boss 在回合中途出现 / 死亡时，剩余时间会重新按新时长
 *   计算。出现 boss → 时间立即拉长（可能数字变大）；boss 死亡 → 时间缩短。
 *   这是有意为之：玩家进入 boss 战自动获得宽限，离开 boss 战也立即正常化。
 * - 一次性触发：每个 hero turn 只触发一次 `onTimeout`，靠 ref 锁定
 *   （key=`playerTurnStartedAt`）防 setInterval 多次触发。
 */
function HeroTurnTimerInner({ onTimeout }: HeroTurnTimerProps) {
  const { t } = useTranslation();
  const gs = useShallowGameState(s => ({
    playerTurnStartedAt: s.playerTurnStartedAt,
    playerTurnPausedAt: s.playerTurnPausedAt,
    combatState: s.combatState,
    gameOver: s.gameOver,
    showSkillSelection: s.showSkillSelection,
    // Detect boss in active row: any cell holds a monster with bossPhase: true.
    // Computed in the selector so shallow-equal can dedupe re-renders when the
    // boolean is stable across state updates.
    hasBossInActiveRow: s.activeCards.some(
      c => c != null && c.type === 'monster' && c.bossPhase === true,
    ),
  }));

  const isVisible =
    gs.playerTurnStartedAt !== null &&
    gs.combatState.engagedMonsterIds.length > 0 &&
    gs.combatState.currentTurn === 'hero' &&
    !gs.gameOver &&
    !gs.showSkillSelection;

  // tick state：作为「重新计算 remaining」的触发器；值无意义。
  const [, setTick] = useState(0);

  // 每个 hero turn 只触发一次 onTimeout。key=playerTurnStartedAt 让新一轮
  // hero turn 自然 reset 这把锁。
  const firedForStartedAtRef = useRef<number | null>(null);
  // 用 ref 存最新 onTimeout，避免 useEffect 因 callback 引用变化而重启 interval。
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const isPaused = gs.playerTurnPausedAt !== null;

  useEffect(() => {
    if (!isVisible) return;
    // 暂停期间没必要每 250ms 重算（remaining 是常数，state 已经冻结）。
    // 一旦 `playerTurnPausedAt` 切回 null（解除击晕、reducer reset
    // playerTurnStartedAt），useEffect 重新挂 interval。
    if (isPaused) return;
    const id = window.setInterval(() => setTick(t => t + 1), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isVisible, isPaused]);

  if (!isVisible || gs.playerTurnStartedAt === null) return null;

  const durationMs = gs.hasBossInActiveRow ? BOSS_HERO_TURN_DURATION_MS : HERO_TURN_DURATION_MS;
  // 暂停时用 playerTurnPausedAt 当作「现在」，让显示冻结在击晕开始那一刻。
  // 非暂停时用 wall-clock now，保持原来的连续 tick 行为。
  const referenceNow = gs.playerTurnPausedAt ?? Date.now();
  const remainingMs = Math.max(
    0,
    durationMs - (referenceNow - gs.playerTurnStartedAt),
  );

  // 触发条件：剩余 0 + 当前 hero turn 还没触发过 + 不在击晕暂停（暂停期间禁止
  // 超时强制结束回合，否则就违反了「击晕给玩家时间」的设计意图）。
  if (
    !isPaused &&
    remainingMs === 0 &&
    firedForStartedAtRef.current !== gs.playerTurnStartedAt
  ) {
    firedForStartedAtRef.current = gs.playerTurnStartedAt;
    // setTimeout 把回调推到下一帧，避免 render 中 dispatch（react warns）。
    window.setTimeout(() => onTimeoutRef.current(), 0);
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isLow = !isPaused && remainingMs <= LOW_TIME_WARNING_MS;
  const isCritical = !isPaused && remainingMs <= CRITICAL_TIME_WARNING_MS;

  // 配色：暂停态显示蓝灰色（跟「击晕怪物」的视觉区分开），常态琥珀，警告 → 红，
  // 危急 → 更亮 + pulse。暂停态不进入 low / critical（remainingMs 已被冻结）。
  const colorClass = isPaused
    ? 'bg-sky-600 text-white ring-2 ring-sky-300'
    : isCritical
      ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-300'
      : isLow
        ? 'bg-red-500 text-white animate-pulse'
        : 'bg-amber-500 text-white';

  return (
    <div
      className={`hero-turn-timer flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-lg select-none font-bold text-sm ${colorClass}`}
      style={{ pointerEvents: 'none' }}
      data-testid="hero-turn-timer"
      data-paused={isPaused ? 'true' : 'false'}
      aria-label={
        isPaused
          ? t('turnTimer.pausedAriaLabel', { seconds: remainingSeconds })
          : t('turnTimer.ariaLabel', { seconds: remainingSeconds })
      }
    >
      {isPaused ? <Pause className="w-4 h-4" /> : <Hourglass className="w-4 h-4" />}
      <span className="font-mono tabular-nums">
        {t('turnTimer.seconds', { seconds: remainingSeconds })}
      </span>
    </div>
  );
}

export const HeroTurnTimer = memo(HeroTurnTimerInner);
