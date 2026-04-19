
The current codebase has a major architectural problem: card behavior is not modeled as structured data, and instead relies on giant functions with deeply nested if/else logic mixing validation, state updates, UI side effects, and special-case rules.
Goal
Refactor the system to preserve gameplay while modularizing card logic, reducing branching, and enabling future data-driven card definitions.
Required Refactor Strategy
Phase 1: Replace giant branching with a handler registry
const skillCardHandlers = {
  x: handleX,
  y: handleY,
  z: handleZ,
};
Phase 2: Separate responsibilities into validation, targeting, effect execution, RNG, dispatch, UI, and trigger
Phase 3: Introduce extensible card effect model:
type CardEffect =
  | { type: 'damage'; value: number; target: 'enemy' }
  | { type: 'heal'; value: number; target: 'self' }
  | { type: 'draw'; value: number }
  | { type: 'gainGold'; value: number }
  | { type: 'applyStatus'; status: string; stacks: number };
Constraints:
- Preserve behavior
- Avoid full rewrite
- Keep strong typing
- Reduce function size
- Avoid UI/perf regressions
Deliverables:
1. Refactored implementation
2. New helper modules
3. Type definitions
4. Minimal wiring changes
5. Clear summary of changes
Important Implementation Guidance
Extract repeated patterns, isolate special-case logic into handlers, separate domain logic from React hooks, and move business logic into plain TypeScript modules.
s

Success Criteria
Card behavior should be easier to locate, adding new cards should not require editing a giant conditional block, and the system should be ready for data-driven definitions.
