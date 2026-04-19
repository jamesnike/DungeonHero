你现在要对 GameBoard.tsx 做一次以真实 render 性能优化为目标的重构。
这不是普通的“拆大文件”任务，而是要针对当前文件的实际问题，降低 rerender 范围和 render 成本。

当前文件的已知问题（请基于这些问题执行，不要泛泛而谈）

我已经确认 GameBoard.tsx 有以下结构性问题：
	1.	GameBoard 当前使用了：
	•	const gs = useGameState(s => s);
	•	然后在顶层一次性解构了大量 state 字段

这意味着几乎任何 game state 变化都会导致整个 GameBoard rerender。
这是本轮必须优先解决的问题。
	2.	GameBoard.tsx 当前超过 10k 行，是一个巨型 orchestrator，里面同时承担了：
	•	board rendering
	•	preview row / active row rendering
	•	stacked card rendering
	•	layout calculation
	•	animation-related style calculation
	•	modal orchestration
	•	input handlers
	•	local UI state
	•	derived data / selectors
	•	various callbacks and effects
	3.	render 中存在大量重 JSX 块和 inline mapping，尤其是：
	•	DUNGEON_COLUMNS.map(...) 的 preview row
	•	DUNGEON_COLUMNS.map(...) 的 active row
	•	preview / active stacked cards 渲染
	•	narrow layout sidebar rendering
	•	大量 inline style object / conditional object / temporary values
	4.	当前文件内部 hook 数量很多（useState / useEffect / useMemo / useCallback 非常多），这说明很多职责仍然耦合在主组件里。
	5.	GameBoardModals 已经被抽出，但 props 仍然非常多。
请评估是否需要进一步减少上层 props churn，避免 modal 子树因为无关变化反复 rerender。

⸻

本轮目标

请把 GameBoard.tsx 从“全量订阅、全量组装、全量 rerender”的结构，重构为：
	•	薄容器
	•	精准 selector 订阅
	•	更小的渲染边界
	•	高频区域和低频区域解耦
	•	更稳定的 props / callbacks / derived values
	•	更低的 render cost

请注意：

本轮的重点不是文件长度本身

如果只是把 JSX 搬到子文件里，但：
	•	GameBoard 仍然订阅整个 state
	•	仍然把大量易变 props 传给子组件
	•	仍然导致整块 rerender

那就不算完成目标。

⸻

一、先做的第一件事：收窄订阅范围

请优先解决 useGameState(s => s) 的问题。

目标：
	•	不要再让 GameBoard 订阅整个 game state
	•	将状态访问改成更细粒度 selector
	•	让不同子区域只订阅自己真正需要的数据切片

请根据当前结构，拆分 selector，至少考虑这些区域：
	•	header-related state
	•	preview row state
	•	active row state
	•	hand / graveyard / class deck state
	•	hero/equipment/amulet state
	•	combat panel / turn control state
	•	modal-related state
	•	narrow-layout-only state
	•	animation display state
	•	tooltip / selection / transient UI state

如果现有 useGameState 支持 selector，请直接利用。
如果还没有合适的 selector 层，请新增 selector/helper，但不要引入重量级新框架。

⸻

二、按真实热点拆分组件，而不是机械拆文件

请优先把下面这些区域从 GameBoard.tsx 中拆出去，并建立明确 rerender boundary：

1. Header container

目前 GameHeader 是单独组件，但它的 props 仍由大容器统一组装。
请评估是否可以进一步：
	•	使用更稳定的 selector
	•	降低 header 因无关 board 变化而重新参与 render 的频率

2. Preview row

把这一整块从主 render 中拆出去，例如：
	•	PreviewRow
	•	PreviewCell
	•	PreviewStack

要求：
	•	不要让某个 preview cell 的局部变化导致整行无意义 rerender
	•	stacked cards 渲染和 animation style 计算尽量局部化
	•	避免在顶层 render 中反复构造 preview animation style / class

3. Active row

把 active row 拆成类似：
	•	ActiveRow
	•	ActiveCell
	•	ActiveCardStack
	•	monster/building-specific wrapper（如果值得）

要求：
	•	将 monster targeting / dungeon targeting / resolving / engaged 状态尽量局部化
	•	避免把大量状态判断堆在顶层 map 里
	•	减少 GameBoard 顶层 render path 的复杂度

4. Board side utilities / narrow layout sidebar

把右侧或 narrow layout 特有的 strip / graveyard / dice / class deck rendering 抽离成单独组件。
尤其是当前这个 render 里的 IIFE：
	•	isNarrowLayout && narrowSidebarPositions && (() => { ... })()

请去掉这种写法，改为清晰的组件边界。

5. Modals orchestration

虽然 GameBoardModals 已经抽出，但请检查：
	•	是否有大量无意义 props churn
	•	是否可以把 modal 所需数据进一步分组、memoize，或者改为更局部 selector
	•	是否可以让无关 board 更新不反复影响 modal tree

⸻

三、把大函数拆成“小函数 + 小hook + selector”

请主动识别 GameBoard.tsx 中以下类型的逻辑，并迁出主组件：

1. 纯派生计算

例如：
	•	animation style calculation
	•	stack offset calculation
	•	layout calculation
	•	card projection / grouping / counters
	•	narrow layout positioning
	•	modal input data shaping

这类逻辑优先提到：
	•	selectors/
	•	utils/
	•	render-helpers/
	•	组件外纯函数

2. 高频但可隔离的 UI 逻辑

例如：
	•	hover / selection / targeting visual state
	•	temporary display-only calculations
	•	per-row / per-cell helper logic

必要时提到局部组件或 custom hook，避免全部挂在 GameBoard 顶层。

3. 大型 callback 群

当前 GameBoard 有大量 useCallback。
请不要机械保留所有 callback 在主组件里。

请把 callback 分成几类：
	•	必须留在 container 的
	•	可以下沉到子组件的
	•	可以抽成 helper 的
	•	可以通过更小组件边界避免传递的

重点目标是：
减少顶层 callback churn 和 props identity 波动。

⸻

四、具体性能要求

请在这轮重构中，实际完成下面这些优化：

1. 为真正重的子组件建立 memo boundary

对适合的组件使用：
	•	React.memo
	•	必要时小心地使用自定义 compare

优先考虑：
	•	row / cell
	•	card stack
	•	narrow sidebar pieces
	•	board overlay pieces
	•	modal content wrappers（若有必要）

但不要无脑 memo 一切。

2. 减少 inline object / array / style 创建

请检查并优化：
	•	render 中的 style object
	•	animation-related inline style
	•	className 拼接中依赖的大量临时值
	•	inline arrays / inline object props

3. 减少顶层 render 中的 map/filter/sort/transform

尤其是 board rendering path。
如果某些数据可以在 selector 或 memoized helper 中预计算，请迁出去。

4. 避免把整个大对象传给子组件

例如：
	•	不要继续把大 state object 或过大的聚合对象往下传
	•	尽量只传子组件真正需要的最小字段
	•	告诉我每个新组件的主要 rerender trigger 是什么

5. 保持行为不变

这轮不要顺手改游戏规则，不要修改 battle logic。
本轮只做 UI/render 层重构和性能优化。

⸻

五、执行顺序

请严格按下面顺序推进，不要只给建议：

第一步：先分析当前文件的实际 rerender 热点

请先根据这个文件的真实结构，说明：
	•	为什么 useGameState(s => s) 是主要瓶颈
	•	哪几个 render block 最值得优先拆
	•	哪些 props / callback / derived value 最可能导致 memo 失效

然后立刻开始改代码。

第二步：先完成第一批“高价值拆分”

优先处理：
	1.	state selector 收窄
	2.	preview row / active row 拆分
	3.	narrow sidebar 拆分
	4.	顶层 render 中的 style / derived helper 提取

第三步：再处理 modal / overlay / callback 稳定化

在第一批完成后，再继续清理：
	•	modal props churn
	•	overlay / tooltip / transient UI state 污染
	•	大型 callback 下沉 / 拆分

⸻

六、输出要求

每完成一批改动，请明确告诉我：
	1.	改了哪些文件
	2.	哪些区域不再由 GameBoard 顶层直接渲染
	3.	哪些 selector 已经从“全量订阅”改成“精准订阅”
	4.	哪些组件现在有了明确的 rerender boundary
	5.	哪些 props / callbacks / derived calculations 已经稳定化
	6.	预计哪部分 render cost 会明显下降

⸻

七、禁止事项

本轮禁止：
	•	不要重写 battle/game-core 逻辑
	•	不要只做“拆文件但订阅方式不变”的表面重构
	•	不要顺手大规模重命名业务概念
	•	不要引入重量级新状态框架
	•	不要只停留在分析层，不落地代码

⸻

八、最重要的判断标准

请始终以这个标准判断是否值得修改：

如果某个局部 UI 变化，不应该导致整个 GameBoard 大面积 rerender，那么就必须通过更细粒度 selector、组件拆分、props 稳定化和 memo boundary 把它隔离开。

现在请直接开始：
	1.	先分析当前 GameBoard.tsx 的主要 rerender 热点
	2.	给出第一批最值得做的拆分计划
	3.	立即开始修改代码
	4.	每一批改动后汇报真实收益