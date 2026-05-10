import { memo, useEffect, useRef, useState } from 'react';
import { Hourglass } from 'lucide-react';
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
 *   （包括 modal / 动画 / awaiting* 阶段）。
 * - 持久化：通过 `playerTurnStartedAt` 持久化到 localStorage，刷新页面后从
 *   原时间戳继续倒数（可能直接归零并触发 `onTimeout`）。
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

  useEffect(() => {
    if (!isVisible) return;
    const id = window.setInterval(() => setTick(t => t + 1), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isVisible]);

  if (!isVisible || gs.playerTurnStartedAt === null) return null;

  const durationMs = gs.hasBossInActiveRow ? BOSS_HERO_TURN_DURATION_MS : HERO_TURN_DURATION_MS;
  const remainingMs = Math.max(
    0,
    durationMs - (Date.now() - gs.playerTurnStartedAt),
  );

  // 触发条件：剩余 0 + 当前 hero turn 还没触发过。
  if (remainingMs === 0 && firedForStartedAtRef.current !== gs.playerTurnStartedAt) {
    firedForStartedAtRef.current = gs.playerTurnStartedAt;
    // setTimeout 把回调推到下一帧，避免 render 中 dispatch（react warns）。
    window.setTimeout(() => onTimeoutRef.current(), 0);
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isLow = remainingMs <= LOW_TIME_WARNING_MS;
  const isCritical = remainingMs <= CRITICAL_TIME_WARNING_MS;

  // 配色：常态琥珀（跟 End Hero Turn 按钮主色一致），警告 → 红，危急 → 更亮 + pulse。
  const colorClass = isCritical
    ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-300'
    : isLow
      ? 'bg-red-500 text-white animate-pulse'
      : 'bg-amber-500 text-white';

  return (
    <div
      className={`hero-turn-timer flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-lg select-none font-bold text-sm ${colorClass}`}
      style={{ pointerEvents: 'none' }}
      data-testid="hero-turn-timer"
      aria-label={t('turnTimer.ariaLabel', { seconds: remainingSeconds })}
    >
      <Hourglass className="w-4 h-4" />
      <span className="font-mono tabular-nums">
        {t('turnTimer.seconds', { seconds: remainingSeconds })}
      </span>
    </div>
  );
}

export const HeroTurnTimer = memo(HeroTurnTimerInner);
