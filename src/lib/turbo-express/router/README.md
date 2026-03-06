# Zod-Express Router - Design Philosophy & Taste

## Core Design Principle

**"Express plus schema, not a schema-first framework"**

We extend Express's native patterns without introducing new abstractions or magical behavior. Everything should feel familiar to Express developers while adding optional Zod validation at the routing layer.

---

## Design Choices (Explained)

### 1. Schema is Optional & Explicit

```typescript
// Don't need validation? Don't write schema
router.get("/health", handler);

// Need validation? Add schema
router.schema(schema).get("/users", handler);
```

**Why:** Validation is a choice, not mandatory. Follows Express philosophy of "only pay for what you use."

---

### 2. Schema Sticks Within a Chain

```typescript
// Schema sticks to subsequent methods in same chain
router
  .schema(userSchema)
  .get("/users", listHandler) // uses userSchema
  .post("/users", createHandler) // uses userSchema
  .put("/users/:id", updateHandler) // uses userSchema
  .schema(adminSchema) // new schema replaces
  .delete("/users/:id", deleteHandler); // uses adminSchema

// New chain, schema resets
router.get("/health", handler); // no schema
```

**Why:**

- DRY - reuse schema across related methods naturally
- Elegant - reads like prose "for users schema, do these three things"
- Flexible - can override with new schema anytime
- Functional - state is scoped to the chain, not the router instance

---

### 3. Methods Return `this` for Builder Pattern

```typescript
// Each method returns the same builder instance
router
  .schema(schema)
  .get("/users", h1) // returns router
  .post("/users", h2) // same router, continues chain
  .put("/users/:id", h3); // same router, continues chain
```

**Why:**

- Fluent chaining is natural and readable
- State management is clear (schema sticks in this builder)
- Stateful builder is more intuitive than functional pipeline
- Matches how Express router works

---

### 4. Native Express Middleware Pattern

```typescript
// Middleware goes directly after path, just like Express
router.schema(schema).get("/users", middleware1, middleware2, handler);

// Compare to Express style:
// router.get("/users", middleware1, middleware2, handler)
```

**Why:**

- No new patterns to learn
- Express developers immediately understand it
- Middleware is Express's native feature, don't reinvent
- Natural to how HTTP requests flow (middlewares run in order)

---

### 5. Path is Native Express Behavior

```typescript
// Both work, just like Express
router.get(handler); // default path "/"
router.get("/users", handler); // explicit path
router.schema(schema).get("/path", handler);

// No path grouping (like Express Router.route() handles this)
```

**Why:**

- Express already handles path matching elegantly
- Adding path grouping adds abstraction we don't need
- Keep schema concerns separate from path concerns
- Explicit path on each method is clearer

---

### 6. Single Validation Layer - Just Schema

```typescript
// Schema validates: body, query, params, headers
const schema = z.object({
  body: z.object({
    /* ... */
  }),
  query: z.object({
    /* ... */
  }),
  params: z.object({
    /* ... */
  }),
  headers: z
    .object({
      /* ... */
    })
    .passthrough(),
});

router.schema(schema).post("/users/:id", handler);
```

**Why:**

- Zod is powerful enough for all validation needs
- No need for explicit param helpers
- Single source of truth for validation
- Conditional/custom validation via Zod's `.superRefine()`

---

### 7. Global Middleware via `.use()`

```typescript
// Native Express middleware - no schema involvement
router.use(cors());
router.use(express.json());
router.use(authMiddleware);

// Schema is separate concern
router.schema(schema).get("/protected", handler);
```

**Why:**

- Express already has `.use()` for global middleware
- Middleware and validation are different concerns
- Don't mix them
- Schema is per-route, not global

---

## The Complete Picture

### Request Flow

```
HTTP Request
    ↓
Global Middleware (.use())
    ↓
Route Match
    ↓
Per-Route Middleware (in .get()/.post() etc)
    ↓
Schema Validation (if schema defined)
    ↓
Handler Execution
    ↓
Response
```

### API Surface

```typescript
// Creation
const router = createZodRouter(options?)

// Global middleware (native Express)
router.use(middleware)

// Routes without validation
router.get("/path", middleware?, handler)
router.post("/path", middleware?, handler)
// ... all HTTP methods

// Routes with validation (schema sticks)
router
  .schema(schema)
  .get("/path", middleware?, handler)
  .post("/path", middleware?, handler)
  .put("/path", middleware?, handler)
  .delete("/path", middleware?, handler)

// New schema breaks the chain
router
  .schema(newSchema)
  .patch("/path", handler)

// Registration with Express
app.use("/api", router.getRouter())
```

---

## Design Principles (Why We Made These Choices)

### 1. **Minimal Abstraction**

Don't create concepts Express doesn't have. Middleware is middleware, routing is routing, validation is validation.

### 2. **Optional by Default**

Schema is opt-in. If you don't need validation, don't write it. No forced empty schemas.

### 3. **Express-Idiomatic**

Every pattern should feel natural to Express developers. No special syntax or learning curve beyond Zod itself.

### 4. **Explicit Over Implicit**

Seeing `router.schema()` immediately tells you "this route is validated." Magic is the enemy.

### 5. **Composition Over Configuration**

Chain methods to build behavior. Don't create config objects.

### 6. **Stateful Builder Within Scope**

Schema sticks within a chain to avoid DRY violations. But state resets with new chains or new schema calls.

### 7. **Single Responsibility**

- Schema validates input
- Middleware handles cross-cutting concerns
- Router handles routing
- Don't blur these lines

---

## Taste Philosophy

### What This ISN'T

❌ A framework - it's an extension of Express
❌ Magic - everything is explicit
❌ Opinionated about structure - you decide app organization
❌ A wrapper that hides Express - everything underneath still works
❌ Dependency injection or anything fancy - just routing + validation

### What This IS

✅ A natural extension of Express
✅ Zod validation at the routing layer
✅ Optional by design
✅ Familiar to Express developers
✅ Composable with native Express
✅ Minimal, focused, do one thing well

### The Aesthetic

**Clean.** Lines of code should read like intent.

```typescript
router
  .schema(userSchema) // "validate against userSchema"
  .get("/users", listHandler) // "GET /users → listHandler"
  .post("/users", createHandler); // "POST /users → createHandler"
```

No noise. No boilerplate. Just routing + validation.

---

## Key Decisions Summary

| Aspect                 | Choice           | Why                             |
| ---------------------- | ---------------- | ------------------------------- |
| Schema Optional        | Yes              | Not all routes need validation  |
| Schema Sticks          | Yes, in chain    | DRY, natural reuse              |
| Builder Returns `this` | Yes              | Fluent, stateful, intuitive     |
| Middleware Pattern     | Native Express   | No new patterns                 |
| Path Handling          | Express style    | No abstraction needed           |
| Param Validation       | Via schema       | Single validation layer         |
| Global Middleware      | Via `.use()`     | Already how Express works       |
| Validation Location    | Per-route schema | Clear, explicit, testable       |
| Configuration          | Fluent API       | Composition, not config objects |

---

## Example: The Complete Taste

```typescript
import express from "express";
import { z } from "zod";
import { createZodRouter } from "./zod-express-router";

const app = express();
app.use(express.json());

// Create router
const router = createZodRouter();

// Define schemas
const userSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2),
  }),
});

const userDetailSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Global middleware (native Express)
router.use((req, res, next) => {
  req.id = generateId();
  next();
});

// Routes with schema - schema sticks
router
  .schema(userSchema)
  .get("/users", listUsers) // no schema needed for GET list
  .post("/users", createUser); // validates body

// Oops, need different schema for detail routes
// Break the chain with new schema
router
  .schema(userDetailSchema)
  .get("/users/:id", getUser) // validates params
  .put("/users/:id", updateUser) // validates params
  .delete("/users/:id", deleteUser); // validates params

// Route with no validation - no schema call needed
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Register with app
app.use("/api", router.getRouter());

// Everything still works with Express
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(3000);
```

**This reads like:**

- "For users data, schema validates body"
- "GET /users endpoint, no schema (list doesn't validate)"
- "POST /users endpoint, validates body"
- "For user details, schema validates params"
- "GET/PUT/DELETE /users/:id, all validate params"
- "Health check, no validation"

**No magic. No framework. Just Express + Zod.**

---

## Implementation Guideline

When building this, keep asking:

**"Does an Express developer immediately understand this without docs?"**

If not, simplify.

**"Is this doing something Express already does?"**

If yes, use Express's way.

**"Does this add value?"**

If not, remove it.

This is the taste. This is the philosophy.
