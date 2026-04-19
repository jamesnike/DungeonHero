你现在是一个资深游戏客户端 / 前端架构工程师。请帮我对当前项目做一次架构级重构，目标是把现有基于 React + 大量 useEffect 的游戏逻辑，迁移为一个确定性、可测试、可回放、可扩展的 game core。

一、项目背景

这是一个卡牌 + 战棋 + roguelike 风格的游戏，当前主要问题不是 UI，而是游戏状态过多、useEffect 过多、状态依赖混乱。现在经常出现各种漏触发 / 顺序错乱问题，例如：
	•	该抽牌的时候没有抽牌
	•	某些 start-of-turn / end-of-turn 效果没有稳定触发
	•	某些状态变化依赖另一个 useEffect，导致时序偶发错误
	•	玩到中后期，状态链条太复杂，debug 很痛苦

当前问题的根本原因是：

React lifecycle / useEffect 被当成了游戏规则引擎。

我希望你把它重构为：
	•	React 只负责 view / UI 展示
	•	游戏规则全部迁移到独立的 game core
	•	所有状态变化都通过显式 action 驱动
	•	复杂结算通过 action queue / effect queue 串行执行
	•	不再依赖多个 useEffect 彼此“观察”和“补触发”

二、总体目标

请你对现有代码进行分析，然后完成以下重构目标：

目标 1：建立独立的 game core

创建一个独立于 React 的游戏核心层，例如：
	•	src/game-core/
	•	types.ts
	•	state.ts
	•	actions.ts
	•	reducer.ts
	•	engine.ts
	•	queue.ts
	•	selectors.ts
	•	rules/
	•	utils/

要求：
	•	game core 不直接依赖 React
	•	game core 尽量保持纯函数 / 可预测
	•	UI 不再直接操作零散 state，而是通过统一 dispatch 驱动

目标 2：统一 GameState

请梳理现有所有关键游戏状态，并聚合成一个清晰的 GameState。至少要覆盖：
	•	玩家信息
	•	敌人信息
	•	棋盘 / board
	•	手牌 / 牌库 / 弃牌堆 / 消耗堆
	•	回合信息
	•	phase / subphase
	•	action queue
	•	随机数种子或 RNG 状态（如果当前项目合适）
	•	待播放动画 / 待展示事件（如果需要和 UI 协作）
	•	buff / debuff / relic / status effect
	•	battle 结算状态
	•	选中态 / targeting 态（如果属于核心规则层）

要求：
	•	明确区分“游戏真实状态”和“纯 UI 状态”
	•	能放进 core 的尽量放 core
	•	纯展示态、hover、modal 开关之类保留在 React

目标 3：建立显式 action 系统

定义统一的 GameAction，例如但不限于：
	•	START_BATTLE
	•	START_TURN
	•	DRAW_CARDS
	•	PLAY_CARD
	•	DISCARD_CARD
	•	END_TURN
	•	ENQUEUE_ACTIONS
	•	RESOLVE_NEXT_ACTION
	•	APPLY_DAMAGE
	•	HEAL
	•	ADD_STATUS
	•	REMOVE_STATUS
	•	SUMMON_UNIT
	•	MOVE_UNIT
	•	CHECK_DEATH
	•	TRIGGER_PASSIVES
	•	CHECK_BATTLE_END

要求：
	•	所有核心规则变化都通过 action 发生
	•	不允许继续依赖 useEffect(() => { if (...) ... }) 来推进主流程
	•	action 命名要语义清晰
	•	尽量支持以后做日志、回放、测试

目标 4：建立 action queue / resolution pipeline

这是这次重构的核心。

请实现一个明确的队列式结算机制，使游戏流程像下面这样执行：
	•	START_TURN
	•	重置能量
	•	入队 DRAW_CARDS
	•	入队 start-of-turn 被动效果
	•	入队 ENTER_PLAYER_INPUT

或者：
	•	PLAY_CARD
	•	扣能量
	•	将卡牌效果拆成若干 action 入队
	•	逐个 resolve
	•	最后弃牌
	•	检查死亡
	•	检查战斗结束

要求：
	•	游戏流程以“命令式、串行、确定性”的方式推进
	•	不靠多个 observer 副作用拼流程
	•	后续可以很方便地接动画系统
	•	后续可以很方便地做联网同步或 replay

目标 5：React 降级为 View Layer

请把 React 组件改造成：
	•	读取 game state
	•	展示 hand / board / unit / hp / energy / buffs
	•	将用户操作转成 dispatch(action)

例如：
	•	用户点击出牌 -> dispatch({ type: "PLAY_CARD", ... })
	•	用户结束回合 -> dispatch({ type: "END_TURN" })

要求：
	•	React 不再负责“发现该抽牌了”
	•	React 不再负责“发现敌人死了”
	•	React 不再负责“发现 queue 空了该切 phase 了”
	•	这类规则必须进入 game core

三、重构原则

请严格遵守下面这些原则：

原则 1：优先稳定性和可解释性，不要搞花哨抽象

我不要过度工程化，也不要为了架构而架构。请做一个：
	•	清晰
	•	可维护
	•	容易 debug
	•	适合独立开发者长期迭代
的结构。

原则 2：最大限度保留现有业务逻辑

重构目标不是重写整个游戏设计，而是迁移架构。
请尽量保留现有规则、数据结构、命名语义和已有功能，除非当前实现明显不合理。

原则 3：逐步迁移，不要一次全炸

如果当前项目比较大，请采用渐进式迁移策略，例如：
	•	先引入 GameState + dispatch
	•	再迁移 turn flow
	•	再迁移 card resolution
	•	再迁移 enemy AI
	•	最后清理遗留 useEffect

如果你认为需要分阶段，请直接这么做。

原则 4：不要继续新增 useEffect 规则链

重构过程中，不要再用新的 useEffect 去补旧逻辑。
可以保留少量纯 UI / bridge effect，例如：
	•	监听窗口 resize
	•	播放动画
	•	音效
	•	本地存档同步
但不能让核心结算流程继续依赖 effect 链。

原则 5：尽量可测试

请把 core 尽量设计成可单测的结构。
最好能让我后续写出类似这种测试：
	•	给定初始 state
	•	dispatch START_TURN
	•	验证 hand 增加、energy 重置、phase 正确

或者：
	•	给定初始 state
	•	dispatch PLAY_CARD(Fireball, enemyA)
	•	验证 enemyA 扣血、卡牌进入弃牌堆、action queue 清空

四、你需要输出的内容

请不要只给建议。请直接动手改代码，并在每一步明确说明：

第一步：先分析当前代码

请先扫描项目，找出：
	•	当前核心游戏状态在哪里
	•	哪些 useEffect 在驱动主流程
	•	哪些组件承担了不该承担的规则责任
	•	哪些逻辑最适合优先迁移

先给我一个简要迁移计划，然后开始实施。

第二步：优先完成最小可运行重构

先把最关键、最容易出 bug 的主流程迁出来，例如：
	•	start turn
	•	draw
	•	play card
	•	end turn
	•	death check
	•	battle flow

让我尽快得到一个“逻辑已经进入统一核心”的版本。

第三步：补充必要的类型、注释和结构整理

请不要只追求跑通，也要保证：
	•	TypeScript 类型尽量完整
	•	文件组织合理
	•	关键逻辑有简洁注释
	•	命名统一

第四步：最后给出迁移总结

完成后，请告诉我：
	•	哪些旧 useEffect 已经可以删除
	•	哪些地方还只是 bridge / 临时兼容层
	•	下一步最建议继续迁哪些模块

五、具体技术要求

请优先使用 TypeScript。

如果项目当前已经使用：
	•	React context
	•	Zustand
	•	Redux
	•	自定义 hooks
请根据现状做最稳妥的融合，但原则不变：
核心规则必须从 React effect 链中剥离。

如果需要，我接受以下风格之一：
	•	纯 reducer + queue
	•	状态机 + reducer
	•	engine + command queue
但不要引入过重、学习成本很高的大框架，除非项目中本来就已经有。

六、一个理想的方向示例

我希望最终结构更接近下面这种思路：
	•	dispatch(action) 是唯一入口
	•	reducer / engine 决定如何更新 state
	•	某些高阶 action 会展开成多个 queued actions
	•	queue 被逐步 resolve
	•	React 只订阅 state 并渲染

例如：
	•	START_TURN
	•	reset energy
	•	enqueue draw
	•	enqueue passive triggers
	•	enter player input
	•	PLAY_CARD
	•	validate legality
	•	spend energy
	•	enqueue card effects
	•	enqueue discard
	•	enqueue death check
	•	enqueue battle end check

这只是方向示例，不要求逐字照搬，请结合当前项目实际代码来设计。

七、执行方式

请你现在直接开始：
	1.	先扫描代码库并识别当前游戏主循环和 useEffect 规则链
	2.	给出简短迁移计划
	3.	立即开始第一阶段重构
	4.	每完成一批改动，就说明：
	•	改了哪些文件
	•	为什么这样改
	•	还有什么遗留问题

如果当前项目过大，请你主动采取“最小可运行迁移”策略

=====================================================

关于 ”DEPS-HEAVY functions that are deeply intertwined with UI animations, async flows, and external dependencies “ 没有被迁出的问题。

保留这些 deps-heavy functions 是合理的，但我现在需要你进一步把“为什么没迁”结构化，而不是停在抽象描述。

请继续下一步，不要只解释。请针对所有尚未迁移的 DEPS-HEAVY functions that are deeply intertwined with UI animations, async flows, and external dependencies，完成下面工作：

1. 先列出未迁移函数清单

请逐个列出这些函数，并注明：
	•	文件路径
	•	函数名
	•	当前职责
	•	为什么本轮没有迁移
	•	它属于以下哪一类：
	•	UI_ONLY：应永久留在 UI / animation / presentation 层
	•	SPLIT_REQUIRED：当前函数混合了规则层和表现层，下一步应拆分
	•	TEMP_BRIDGE：目前为了兼容保留，但后续应继续迁移或削薄

不要只给概括，请给明确列表。

2. 对 SPLIT_REQUIRED 的函数，立即开始拆分

对于所有 SPLIT_REQUIRED 的函数，请不要继续整块保留。请把它们拆成：
	•	game-core decision / state transition
	•	UI animation / async presentation
	•	bridge / adapter（如果暂时需要）

要求：
	•	规则判断、状态推进、抽牌、扣血、死亡检查、phase 切换、battle end 判定，必须继续迁入 game core
	•	动画、延时、视觉节奏、音效、DOM/UI 控制，留在外层
	•	不允许“因为有动画或 async”就把规则层也一起留在旧函数里

3. 不要让 async/animation 决定规则推进

请重点检查这些未迁移函数中，是否仍存在以下反模式：
	•	动画结束后才决定是否抽牌
	•	await 某个动画后才判断是否死亡
	•	setTimeout / promise / animation callback 中推进 phase
	•	UI 层决定 battle 是否结束
	•	外部依赖决定 queue 是否继续 resolve

如果存在，请优先拆掉。
规则层必须先得到确定性结果；动画层只能消费这些结果，不能决定规则是否发生。

4. 产出一个明确的边界模式

请把后续结构整理成下面这种模式之一，并实际落地到代码：

模式 A：core 先算结果，UI 消费事件

例如：
	•	PLAY_CARD -> core 立即计算伤害、死亡、抽牌、battle end
	•	UI 根据 state diff / emitted events 播放动画

模式 B：core 产出 effect/event list，presentation 层顺序播放

例如：
	•	core resolve 后返回：
	•	CARD_PLAYED
	•	DAMAGE_APPLIED
	•	UNIT_DIED
	•	CARD_DRAWN
	•	animation layer 消费这些事件来播放表现

无论选哪种，都不要让动画和 async callback 继续主导规则流程。

5. 这轮请优先继续清理 battle flow 剩余污染点

重点继续检查并迁移以下内容中仍然残留在 deps-heavy functions 里的规则逻辑：
	•	draw 相关规则
	•	play card 相关规则
	•	damage / heal / death 规则
	•	turn / phase 切换
	•	enemy action 推进
	•	battle end 判定

6. 输出要求

每完成一批改动，请明确告诉我：
	•	哪些未迁移函数被归类为 UI_ONLY
	•	哪些被归类为 SPLIT_REQUIRED
	•	哪些被归类为 TEMP_BRIDGE
	•	哪些函数已经成功拆成 core + presentation
	•	哪些旧 async / animation-driven rule flow 已被移除
	•	还有哪些高风险遗留点

不要只做分析，请直接继续修改代码。