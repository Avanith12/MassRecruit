# .kiro — how this project was built with Kiro

This directory is required by the Hackachusetts rules and documents our use of Kiro.
**It must stay committed and must not be added to `.gitignore`.**

```
.kiro/
├── steering/                 # always-on context that shaped every response
│   ├── product.md            # users, roles, non-negotiable product rules
│   ├── tech.md               # stack, architecture conventions, security defaults
│   └── structure.md          # where code lives
├── specs/
│   └── recruitment-lifecycle/
│       ├── requirements.md    # EARS-style acceptance criteria (written first)
│       ├── design.md          # layering, data model, key decisions
│       └── tasks.md           # implementation plan, all checked off
└── hooks/
    ├── verify-on-save.json         # typecheck + unit/property tests on save
    ├── reseed-on-schema-change.json# migrate + reseed after a Prisma schema edit
    └── e2e-before-push.json        # Playwright suite before git push
```

- **Spec-driven development:** we authored `requirements.md` → `design.md` → `tasks.md`
  before writing code, which kept the data model and the booking/consent/reminder rules
  consistent and let us build against acceptance criteria instead of ad-hoc prompts.
- **Steering:** the three steering docs encoded the stack and the hard rules
  (e.g. "researchers gated behind admin verification", "`.edu` only", "no double-booking"),
  so generated code stayed on-pattern.
- **Property-based testing:** fast-check invariants in `tests/unit/` caught real bugs —
  e.g. a school name with doubled whitespace failing to match a search.
