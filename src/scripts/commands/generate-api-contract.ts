#!/usr/bin/env tsx
/**
 * scaffold-api-types.ts
 *
 * Parses Express route files and extracts fully-resolved API structure.
 * Supports two routing patterns:
 *
 *   1. Legacy: router.get("/path", inputValidationMiddleware(schema, handler))
 *   2. ZodRouter fluent chain:
 *        router.schema(z.object({...})).get("/path", handler)
 *              .schema(z.object({...})).post("/path", handler)
 *
 * Usage:
 *   npx tsx scaffold-api-types.ts ./src/routes
 *   npx tsx scaffold-api-types.ts ./src/routes --out ./src/types/api.d.ts
 *   npx tsx scaffold-api-types.ts ./src/routes --format json
 *   npx tsx scaffold-api-types.ts ./src/routes --tsconfig ./tsconfig.json
 */

import fs from "fs";
import path from "path";
import ts from "typescript";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface FieldSchema {
  type: string;
  optional?: boolean;
  enum?: string[];
  enumRef?: string;
  min?: number;
  max?: number;
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
}

interface RouteDefinition {
  file: string;
  path: string; // route-file-local path e.g. "/:id"
  fullPath: string; // fully resolved mount path e.g. "/api/advertisement/:id"
  method: "get" | "post" | "put" | "patch" | "delete";
  hasValidation: boolean;
  query: Record<string, FieldSchema>;
  body: Record<string, FieldSchema>;
  params: Record<string, FieldSchema>;
  response: string;
  errors: Array<{ message: string; statusCode: number }>;
}

// ──────────────────────────────────────────────────────────────
// TypeScript Program — built once, shared across all files
// ──────────────────────────────────────────────────────────────

let _program: ts.Program | null = null;
let _checker: ts.TypeChecker | null = null;

function buildProgram(rootFiles: string[], tsconfigPath: string | null): void {
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    strict: false,
    skipLibCheck: true,
    noEmit: true,
  };

  if (tsconfigPath && fs.existsSync(tsconfigPath)) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath),
      );
      compilerOptions = { ...parsed.options, noEmit: true, skipLibCheck: true };
    }
  }

  _program = ts.createProgram(rootFiles, compilerOptions);
  _checker = _program.getTypeChecker();
}

function getChecker(): ts.TypeChecker {
  if (!_checker)
    throw new Error("TypeChecker not initialised — call buildProgram() first");
  return _checker;
}

function getCheckedSourceFile(filePath: string): ts.SourceFile | undefined {
  return _program?.getSourceFile(filePath);
}

// ──────────────────────────────────────────────────────────────
// Resolve response type using the type checker
// ──────────────────────────────────────────────────────────────

function resolveResponseType(
  argNode: ts.Expression,
  sourceFile: ts.SourceFile,
): string {
  const checker = getChecker();
  const type = checker.getTypeAtLocation(argNode);
  const flags =
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.UseFullyQualifiedType |
    ts.TypeFormatFlags.InTypeAlias;
  const typeStr = checker.typeToString(type, argNode, flags);
  if (typeStr === "{}" || typeStr === "any") return "unknown";
  return typeStr;
}

function extractResponseTypes(
  handlerNode: ts.Node,
  sourceFile: ts.SourceFile,
): string {
  const types: string[] = [];

  function walk(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "json" &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0] as ts.Expression;
      try {
        const t = resolveResponseType(arg, sourceFile);
        if (t && t !== "unknown" && !types.includes(t)) {
          types.push(t);
        }
      } catch {
        // type checker failed for this node — skip
      }
    }
    ts.forEachChild(node, walk);
  }

  walk(handlerNode);

  if (types.length === 0) return "unknown";
  if (types.length === 1) return types[0]!;
  return types.join(" | ");
}

// ──────────────────────────────────────────────────────────────
// Symbol resolver — follows imports to find literal array/enum values
// ──────────────────────────────────────────────────────────────

const parsedFileCache = new Map<string, ts.SourceFile>();

function getParsedSourceFile(filePath: string): ts.SourceFile | null {
  const checked = getCheckedSourceFile(filePath);
  if (checked) return checked;

  if (parsedFileCache.has(filePath))
    return parsedFileCache.get(filePath) as ts.SourceFile;
  try {
    const src = fs.readFileSync(filePath, "utf-8");
    const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);
    parsedFileCache.set(filePath, sf);
    return sf;
  } catch {
    return null;
  }
}

function extractStringArrayFromFile(
  sf: ts.SourceFile,
  name: string,
): string[] | null {
  let result: string[] | null = null;

  function visit(node: ts.Node) {
    if (result) return;

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
        if (!decl.initializer) continue;
        const values = extractStringLiteralsFromNode(decl.initializer);
        if (values !== null) {
          result = values;
          return;
        }
      }
    }

    if (ts.isEnumDeclaration(node) && node.name.text === name) {
      const values: string[] = [];
      for (const member of node.members) {
        if (member.initializer && ts.isStringLiteral(member.initializer)) {
          values.push(member.initializer.text);
        }
      }
      if (values.length > 0) result = values;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return result;
}

function extractStringLiteralsFromNode(node: ts.Node): string[] | null {
  if (ts.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const el of node.elements) {
      if (ts.isStringLiteral(el)) values.push(el.text);
      else return null;
    }
    return values;
  }
  if (ts.isAsExpression(node))
    return extractStringLiteralsFromNode(node.expression);
  if (ts.isSatisfiesExpression(node))
    return extractStringLiteralsFromNode(node.expression);
  if (ts.isParenthesizedExpression(node))
    return extractStringLiteralsFromNode(node.expression);
  return null;
}

function resolveEnumRef(
  name: string,
  currentFilePath: string,
): string[] | null {
  const sf = getParsedSourceFile(currentFilePath);
  if (!sf) return null;

  const local = extractStringArrayFromFile(sf, name);
  if (local) return local;

  let importedFrom: string | null = null;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        const localName = el.name.text;
        const orig = el.propertyName?.text ?? localName;
        if (localName === name || orig === name) {
          importedFrom = spec;
          break;
        }
      }
    }
    if (importedFrom) break;
  }

  if (!importedFrom) return null;
  const resolved = resolveModulePath(importedFrom, currentFilePath);
  if (!resolved) return null;
  const targetSf = getParsedSourceFile(resolved);
  if (!targetSf) return null;
  return extractStringArrayFromFile(targetSf, name);
}

function resolveModulePath(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const c of [
    base,
    base + ".ts",
    base + ".js",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Mount graph
// ──────────────────────────────────────────────────────────────

function resolveImportPath(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const c of [
    base,
    base + ".ts",
    base + ".js",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ]) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

function buildImportMap(
  sf: ts.SourceFile,
  currentFile: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const resolved = resolveImportPath(specifier, currentFile);
    if (!resolved) continue;

    const clause = stmt.importClause;
    if (!clause) continue;

    if (clause.name) {
      map.set(clause.name.text, resolved);
    }

    const bindings = clause.namedBindings;
    if (bindings) {
      if (ts.isNamespaceImport(bindings)) {
        map.set(bindings.name.text, resolved);
      } else if (ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          map.set(el.name.text, resolved);
        }
      }
    }
  }
  return map;
}

/**
 * Given an expression used as a router argument in `.use()`, extract the root
 * identifier name so we can look it up in the import map. Handles:
 *   - bare identifier:           `myRouter`            → "myRouter"
 *   - method call on identifier: `myRouter.getRouter()` → "myRouter"
 *   - deeper chain:              `foo.bar.getRouter()`  → "foo"
 */
function extractRouterIdentName(arg: ts.Expression): string | null {
  // Bare identifier: router.use("/path", myRouter)
  if (ts.isIdentifier(arg)) return arg.text;

  // Method call: router.use("/path", myRouter.getRouter())
  if (
    ts.isCallExpression(arg) &&
    ts.isPropertyAccessExpression(arg.expression)
  ) {
    let obj: ts.Expression = arg.expression.expression;
    while (ts.isPropertyAccessExpression(obj)) {
      obj = obj.expression;
    }
    if (ts.isIdentifier(obj)) return obj.text;
  }

  return null;
}

function collectMountCalls(
  sf: ts.SourceFile,
): Array<{ prefix: string; identName: string }> {
  const mounts: Array<{ prefix: string; identName: string }> = [];

  function walk(node: ts.Node) {
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === "use"
    ) {
      const args = node.expression.arguments;
      const firstArg = args[0] as ts.Expression | undefined;
      if (args.length >= 2 && firstArg && ts.isStringLiteral(firstArg)) {
        const prefix = firstArg.text;
        for (let i = 1; i < args.length; i++) {
          const identName = extractRouterIdentName(args[i] as ts.Expression);
          if (identName) mounts.push({ prefix, identName });
        }
      }
    }
    ts.forEachChild(node, walk);
  }

  walk(sf);
  return mounts;
}

function buildMountGraph(
  filePath: string,
  currentPrefix: string,
  mountPrefixMap: Map<string, string>,
  visited: Set<string>,
): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  const sf = getParsedSourceFile(filePath);
  if (!sf) return;

  if (!mountPrefixMap.has(filePath)) {
    mountPrefixMap.set(filePath, currentPrefix);
  }

  const importMap = buildImportMap(sf, filePath);
  const mounts = collectMountCalls(sf);

  for (const { prefix, identName } of mounts) {
    const mountedFilePath = importMap.get(identName);
    if (!mountedFilePath) continue;
    const normalised = (
      currentPrefix +
      "/" +
      prefix.replace(/^\/|\/$/g, "")
    ).replace(/\/+/g, "/");
    buildMountGraph(mountedFilePath, normalised, mountPrefixMap, visited);
  }
}

function resolveMountPrefixes(entryFile: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!entryFile || !fs.existsSync(entryFile)) return map;
  buildMountGraph(path.resolve(entryFile), "", map, new Set());
  return map;
}

// ──────────────────────────────────────────────────────────────
// Zod AST → FieldSchema
// ──────────────────────────────────────────────────────────────

function parseZodNode(node: ts.Node, currentFile: string): FieldSchema {
  if (!ts.isCallExpression(node)) return { type: "unknown" };

  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return { type: "unknown" };

  const method = expr.name.text;
  const obj = expr.expression;

  // Chained modifier: z.string().min(2).optional()
  if (ts.isCallExpression(obj)) {
    const inner = parseZodNode(obj, currentFile);
    switch (method) {
      case "optional":
      case "nullable":
        return { ...inner, optional: true };
      case "min":
        return { ...inner, min: extractNumericArg(node, 0) };
      case "max":
        return { ...inner, max: extractNumericArg(node, 0) };
      default:
        return inner;
    }
  }

  // z.coerce.number() etc.
  if (
    ts.isPropertyAccessExpression(obj) &&
    ts.isIdentifier(obj.expression) &&
    obj.name.text === "coerce"
  ) {
    switch (method) {
      case "string":
        return { type: "string" };
      case "number":
        return { type: "number" };
      case "boolean":
        return { type: "boolean" };
      case "date":
        return { type: "string" };
      case "bigint":
        return { type: "number" };
      default:
        return { type: "unknown" };
    }
  }

  // Base: z.string(), z.object({}) etc.
  if (ts.isIdentifier(obj)) {
    switch (method) {
      case "string":
        return { type: "string" };
      case "number":
        return { type: "number" };
      case "boolean":
        return { type: "boolean" };
      case "date":
        return { type: "string" };
      case "bigint":
        return { type: "number" };
      case "any":
        return { type: "any" };
      case "unknown":
        return { type: "unknown" };
      case "null":
        return { type: "null", optional: true };
      case "undefined":
        return { type: "undefined", optional: true };
      case "literal": {
        const arg = node.arguments[0] as ts.Expression | undefined;
        if (!arg) return { type: "unknown" };
        if (ts.isStringLiteral(arg))
          return { type: "string", enum: [arg.text] };
        if (ts.isNumericLiteral(arg)) return { type: "number" };
        return { type: "unknown" };
      }
      case "enum":
        return parseZodEnum(node, currentFile);
      case "nativeEnum": {
        const arg = node.arguments[0] as ts.Expression | undefined;
        if (arg && ts.isIdentifier(arg)) {
          const resolved = resolveEnumRef(arg.text, currentFile);
          if (resolved) return { type: "enum", enum: resolved };
          return { type: "enum", enumRef: arg.text };
        }
        return { type: "enum" };
      }
      case "array": {
        const arrayItemArg = node.arguments[0] as ts.Expression | undefined;
        const inner = arrayItemArg
          ? parseZodNode(arrayItemArg, currentFile)
          : { type: "unknown" };
        return { type: "array", items: inner };
      }
      case "object":
        return parseZodObject(node, currentFile);
      case "record":
        return { type: "object", properties: {} };
      case "union":
      case "discriminatedUnion": {
        const unionArg = node.arguments[0] as ts.Expression | undefined;
        if (
          unionArg &&
          ts.isArrayLiteralExpression(unionArg) &&
          unionArg.elements.length > 0
        ) {
          const firstEl = unionArg.elements[0] as ts.Expression;
          return parseZodNode(firstEl, currentFile);
        }
        return { type: "unknown" };
      }
      case "optional": {
        const optArg = node.arguments[0] as ts.Expression | undefined;
        const inner = optArg
          ? parseZodNode(optArg, currentFile)
          : { type: "unknown" };
        return { ...inner, optional: true };
      }
      case "nullable": {
        const nullArg = node.arguments[0] as ts.Expression | undefined;
        const inner = nullArg
          ? parseZodNode(nullArg, currentFile)
          : { type: "unknown" };
        return { ...inner, optional: true };
      }
      default:
        return { type: "unknown" };
    }
  }

  return { type: "unknown" };
}

function parseZodEnum(
  node: ts.CallExpression,
  currentFile: string,
): FieldSchema {
  const arg = node.arguments[0] as ts.Expression | undefined;
  if (!arg) return { type: "enum", enum: [] };
  if (ts.isArrayLiteralExpression(arg)) {
    const values: string[] = [];
    arg.elements.forEach((el) => {
      if (ts.isStringLiteral(el)) values.push(el.text);
    });
    return { type: "enum", enum: values };
  }
  if (ts.isIdentifier(arg)) {
    const resolved = resolveEnumRef(arg.text, currentFile);
    if (resolved && resolved.length > 0)
      return { type: "enum", enum: resolved };
    return { type: "enum", enumRef: arg.text };
  }
  return { type: "enum", enum: [] };
}

function parseZodObject(
  node: ts.CallExpression,
  currentFile: string,
): FieldSchema {
  const arg = node.arguments[0] as ts.Expression | undefined;
  const properties: Record<string, FieldSchema> = {};
  if (arg && ts.isObjectLiteralExpression(arg)) {
    arg.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop)) {
        const key = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : prop.name.getText();
        properties[key] = parseZodNode(prop.initializer, currentFile);
      }
    });
  }
  return { type: "object", properties };
}

function extractNumericArg(
  node: ts.CallExpression,
  index: number,
): number | undefined {
  const arg = node.arguments[index];
  return arg && ts.isNumericLiteral(arg) ? Number(arg.text) : undefined;
}

/**
 * Extract body/query/params from a z.object({ body: ..., query: ..., params: ... }) node.
 * Used by BOTH the legacy inputValidationMiddleware pattern and the new ZodRouter pattern.
 */
function extractSchemaShape(schemaArg: ts.Node, currentFile: string) {
  const result = {
    body: {} as Record<string, FieldSchema>,
    query: {} as Record<string, FieldSchema>,
    params: {} as Record<string, FieldSchema>,
  };
  if (!ts.isCallExpression(schemaArg)) return result;

  const outer = parseZodNode(schemaArg, currentFile);
  if (outer.type !== "object" || !outer.properties) return result;

  for (const key of ["body", "query", "params"] as const) {
    const f = outer.properties[key];
    if (f?.type === "object" && f.properties) result[key] = f.properties;
  }
  return result;
}

// ──────────────────────────────────────────────────────────────
// Extract AppError throws
// ──────────────────────────────────────────────────────────────

function extractErrors(handlerNode: ts.Node): RouteDefinition["errors"] {
  const errors: RouteDefinition["errors"] = [];
  function walk(node: ts.Node) {
    if (
      ts.isThrowStatement(node) &&
      ts.isNewExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "AppError"
    ) {
      const args = node.expression.arguments ?? [];
      const arg0 = args[0] as ts.Expression | undefined;
      const arg1 = args[1] as ts.Expression | undefined;
      const message =
        arg0 && ts.isStringLiteral(arg0) ? arg0.text : "Unknown error";
      const statusCode =
        arg1 && ts.isNumericLiteral(arg1) ? Number(arg1.text) : 500;
      errors.push({ message, statusCode });
    }
    ts.forEachChild(node, walk);
  }
  walk(handlerNode);
  return errors;
}

// ──────────────────────────────────────────────────────────────
// Path utilities
// ──────────────────────────────────────────────────────────────

function joinPaths(base: string, route: string): string {
  const b = base.replace(/\/+$/, "");
  const r = route.replace(/^\/+/, "");
  if (!r) return b || "/";
  return b + "/" + r;
}

// ──────────────────────────────────────────────────────────────
// NEW: Fluent ZodRouter chain parser
//
// Handles this AST shape (reading right-to-left in the chain):
//
//   router
//     .schema(schemaA)   ← produces CallExpression A
//     .get("/foo", h1)   ← CallExpression on A's result
//     .schema(schemaB)   ← CallExpression on .get()'s result
//     .post("/bar", h2)  ← CallExpression on schemaB's result
//
// The AST nests the calls deep:
//   CallExpr(.post)
//     .expression = PropertyAccess(.post)
//       .expression = CallExpr(.schema B)
//         .expression = PropertyAccess(.schema)
//           .expression = CallExpr(.get)
//             ...
//
// Strategy: flatten the chain from outermost to innermost, then
// replay it left-to-right tracking the "current schema".
// ──────────────────────────────────────────────────────────────

interface ChainSegment {
  method: string; // "schema" | "get" | "post" | ...
  callNode: ts.CallExpression; // the full call node for argument access
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Flatten a fluent method chain into an ordered array of segments.
 * The chain is nested inside-out in the AST, so we collect segments
 * from outermost → innermost and then reverse to get left→right order.
 *
 * Stops when it hits something that isn't a CallExpression on a
 * PropertyAccessExpression (i.e. the root `router` identifier).
 */
function flattenChain(node: ts.CallExpression): ChainSegment[] {
  const segments: ChainSegment[] = [];
  let current: ts.Expression = node;

  while (ts.isCallExpression(current)) {
    const callNode = current as ts.CallExpression;
    const expr = callNode.expression;

    if (!ts.isPropertyAccessExpression(expr)) break;

    segments.push({ method: expr.name.text, callNode });
    current = expr.expression; // walk one level deeper (left in the chain)
  }

  // segments are outermost→innermost; reverse to get left→right
  return segments.reverse();
}

/**
 * Check whether a CallExpression is the ROOT of a fluent ZodRouter chain,
 * i.e. the outermost call in a statement like:
 *   router.schema(...).get(...)...
 *
 * We detect this by checking that the chain contains at least one
 * HTTP method call AND at least one .schema() call preceding it.
 */
function isZodRouterChain(node: ts.CallExpression): boolean {
  const segments = flattenChain(node);
  let sawSchema = false;
  for (const seg of segments) {
    if (seg.method === "schema") {
      sawSchema = true;
      continue;
    }
    if (HTTP_METHODS.includes(seg.method as HttpMethod) && sawSchema)
      return true;
  }
  return false;
}

/**
 * Parse a complete fluent ZodRouter chain expression and return all routes
 * found within it.
 */
function parseZodRouterChain(
  chainRoot: ts.CallExpression,
  filePath: string,
  mountPrefix: string,
  sourceFile: ts.SourceFile,
): RouteDefinition[] {
  const segments = flattenChain(chainRoot);
  const routes: RouteDefinition[] = [];
  const relFile = path.relative(process.cwd(), filePath);

  let currentSchema: {
    body: Record<string, FieldSchema>;
    query: Record<string, FieldSchema>;
    params: Record<string, FieldSchema>;
  } | null = null;

  for (const seg of segments) {
    if (seg.method === "schema") {
      // .schema(z.object({...}))
      const schemaArg = seg.callNode.arguments[0] as ts.Expression | undefined;
      if (schemaArg) {
        currentSchema = extractSchemaShape(schemaArg, filePath);
      }
      continue;
    }

    if (!HTTP_METHODS.includes(seg.method as HttpMethod)) {
      // Could be .use(), .registerWith(), etc. — skip but keep schema context
      continue;
    }

    // HTTP method call: .get("/path", handler) or .get("/path", mw, handler)
    const httpMethod = seg.method as HttpMethod;
    const args = seg.callNode.arguments;

    if (args.length < 2) continue;

    const pathArg = args[0] as ts.Expression;
    if (!ts.isStringLiteral(pathArg)) continue;

    const routePath = pathArg.text;

    // Last argument is always the handler in this router
    const handlerArg = args[args.length - 1] as ts.Expression;

    let response = "unknown";
    let errors: RouteDefinition["errors"] = [];

    if (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg)) {
      response = extractResponseTypes(handlerArg, sourceFile);
      errors = extractErrors(handlerArg);
    }

    routes.push({
      file: relFile,
      path: routePath,
      fullPath: joinPaths(mountPrefix, routePath),
      method: httpMethod,
      hasValidation: currentSchema !== null,
      query: currentSchema?.query ?? {},
      body: currentSchema?.body ?? {},
      params: currentSchema?.params ?? {},
      response,
      errors,
    });

    // After consuming the schema for a route, reset it.
    // The next route needs its own .schema() call (per the ZodRouteWithSchema API).
    // However — looking at the demo — after .get() the chain returns `this`
    // (ZodRouteWithSchema), which means the SAME schema stays active until
    // explicitly replaced with another .schema() call.
    // We therefore do NOT reset currentSchema here.
    // If the user calls .schema() again later, it will overwrite.
  }

  return routes;
}

// ──────────────────────────────────────────────────────────────
// Parse a single route file
// Handles BOTH legacy and ZodRouter patterns.
// ──────────────────────────────────────────────────────────────

function parseRouteFile(
  filePath: string,
  mountPrefix: string,
): RouteDefinition[] {
  const maybeSourceFile = getCheckedSourceFile(filePath);
  if (!maybeSourceFile)
    throw new Error(`Source file not found in program: ${filePath}`);
  const sourceFile: ts.SourceFile = maybeSourceFile;

  const routes: RouteDefinition[] = [];
  const relFile = path.relative(process.cwd(), filePath);

  // Track which CallExpression nodes are INNER parts of a chain we've already
  // processed at the top level, so we don't double-emit them.
  const processedChainNodes = new Set<ts.CallExpression>();

  function walk(node: ts.Node) {
    // ── ZodRouter fluent chain ──────────────────────────────
    // Detect the outermost call of a chain at the ExpressionStatement level.
    // We look for ExpressionStatement → CallExpression that represents the
    // tail of a chain containing both .schema() and an HTTP method.
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression)
    ) {
      const call = node.expression;

      if (!processedChainNodes.has(call) && isZodRouterChain(call)) {
        // Mark all CallExpressions in this chain so we don't re-process them
        // if they appear as nested nodes during the walk.
        markChainNodes(call, processedChainNodes);

        const chainRoutes = parseZodRouterChain(
          call,
          filePath,
          mountPrefix,
          sourceFile,
        );
        routes.push(...chainRoutes);

        // Don't recurse into this statement; we've handled it.
        return;
      }
    }

    // ── Legacy inputValidationMiddleware pattern ────────────
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const callExpr = node.expression;
      if (!ts.isPropertyAccessExpression(callExpr.expression)) {
        ts.forEachChild(node, walk);
        return;
      }
      const methodName = callExpr.expression.name.text;

      if (HTTP_METHODS.includes(methodName as HttpMethod)) {
        const args = callExpr.arguments;
        const firstArg = args[0] as ts.Expression | undefined;
        if (args.length >= 2 && firstArg && ts.isStringLiteral(firstArg)) {
          const routePath = firstArg.text;

          // Check for inputValidationMiddleware(schema, handler) argument
          let validationCall: ts.CallExpression | null = null;
          for (let i = 1; i < args.length; i++) {
            const arg = args[i] as ts.Expression;
            if (
              ts.isCallExpression(arg) &&
              ts.isIdentifier(arg.expression) &&
              arg.expression.text === "inputValidationMiddleware"
            ) {
              validationCall = arg;
              break;
            }
          }

          if (validationCall) {
            const validationArgs = validationCall.arguments;
            const schemaArg = validationArgs[0] as ts.Expression | undefined;
            const handlerArg = validationArgs[1] as ts.Expression | undefined;
            const { body, query, params } = schemaArg
              ? extractSchemaShape(schemaArg, filePath)
              : { body: {}, query: {}, params: {} };

            const response = handlerArg
              ? extractResponseTypes(handlerArg, sourceFile)
              : "unknown";

            const errors = handlerArg ? extractErrors(handlerArg) : [];

            routes.push({
              file: relFile,
              path: routePath,
              fullPath: joinPaths(mountPrefix, routePath),
              method: methodName as HttpMethod,
              hasValidation: true,
              query,
              body,
              params,
              response,
              errors,
            });
            return;
          }

          // No validation middleware — bare handler
          let response = "unknown";
          const errors: RouteDefinition["errors"] = [];

          for (let i = 1; i < args.length; i++) {
            const handler = args[i] as ts.Expression;
            if (
              ts.isArrowFunction(handler) ||
              ts.isFunctionExpression(handler)
            ) {
              const r = extractResponseTypes(handler, sourceFile);
              if (r !== "unknown") response = r;
              errors.push(...extractErrors(handler));
            }
          }

          routes.push({
            file: relFile,
            path: routePath,
            fullPath: joinPaths(mountPrefix, routePath),
            method: methodName as HttpMethod,
            hasValidation: false,
            query: {},
            body: {},
            params: {},
            response,
            errors,
          });
          return;
        }
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return routes;
}

/**
 * Recursively mark all CallExpression nodes in a chain as processed,
 * to prevent them being visited again as nested children.
 */
function markChainNodes(
  node: ts.CallExpression,
  set: Set<ts.CallExpression>,
): void {
  set.add(node);
  const expr = node.expression;
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isCallExpression(expr.expression)
  ) {
    markChainNodes(expr.expression, set);
  }
}

// ──────────────────────────────────────────────────────────────
// Collect route files
// ──────────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

// ──────────────────────────────────────────────────────────────
// Render TypeScript output
// ──────────────────────────────────────────────────────────────

function fieldSchemaToTSType(schema: FieldSchema, indent = 0): string {
  if (!schema) return "unknown";
  const pad = "  ".repeat(indent);
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "any":
      return "any";
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "enum": {
      if (schema.enum && schema.enum.length > 0)
        return schema.enum.map((v) => `"${v}"`).join(" | ");
      if (schema.enumRef) return `typeof ${schema.enumRef}[number]`;
      return "string";
    }
    case "array":
      return `Array<${fieldSchemaToTSType(schema.items ?? { type: "unknown" }, indent)}>`;
    case "object": {
      if (!schema.properties || Object.keys(schema.properties).length === 0)
        return "Record<string, unknown>";
      const lines = Object.entries(schema.properties).map(
        ([k, v]) =>
          `${pad}  ${k}${v.optional ? "?" : ""}: ${fieldSchemaToTSType(v, indent + 1)};`,
      );
      return `{\n${lines.join("\n")}\n${pad}}`;
    }
    default:
      return "unknown";
  }
}

function objToTSType(
  obj: Record<string, FieldSchema>,
  fallbackToAny: boolean,
  indent: number,
): string {
  if (fallbackToAny) return "any";
  if (Object.keys(obj).length === 0) return "Record<string, never>";
  const pad = "  ".repeat(indent);
  const lines = Object.entries(obj).map(
    ([k, v]) =>
      `${pad}  ${k}${v?.optional ? "?" : ""}: ${fieldSchemaToTSType(v, indent + 1)};`,
  );
  return `{\n${lines.join("\n")}\n${pad}}`;
}

function routeToTypeName(route: RouteDefinition): string {
  const method = route.method.charAt(0).toUpperCase() + route.method.slice(1);
  const pathPart =
    route.fullPath
      .replace(/^\//, "")
      .replace(/\//g, "_")
      .replace(/:([a-zA-Z]+)/g, "$1")
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9_]/g, "") || "root";
  return `${method}${pathPart.charAt(0).toUpperCase() + pathPart.slice(1)}Route`;
}

function renderTypeScript(routes: RouteDefinition[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED by scaffold-api-types.ts — DO NOT EDIT",
    `// Generated: ${new Date().toISOString()}`,
    "",
  ];

  const byFile = routes.reduce<Record<string, RouteDefinition[]>>((acc, r) => {
    (acc[r.file] = acc[r.file] ?? []).push(r);
    return acc;
  }, {});

  for (const [file, fileRoutes] of Object.entries(byFile)) {
    lines.push(`// ── ${file} ──`);
    for (const route of fileRoutes) {
      const noValidation = !route.hasValidation;
      lines.push("");
      lines.push(
        `/** ${route.method.toUpperCase()} ${route.fullPath}${noValidation ? "  ⚠ no schema" : ""} */`,
      );
      lines.push(`export interface ${routeToTypeName(route)} {`);
      lines.push(`  path: "${route.fullPath}";`);
      lines.push(`  method: "${route.method}";`);
      lines.push(`  query: ${objToTSType(route.query, noValidation, 1)};`);
      lines.push(`  body: ${objToTSType(route.body, noValidation, 1)};`);
      lines.push(`  params: ${objToTSType(route.params, noValidation, 1)};`);
      lines.push(`  response: ${route.response};`);
      if (route.errors.length > 0) {
        lines.push(`  errors: [`);
        for (const e of route.errors) {
          lines.push(
            `    { statusCode: ${e.statusCode}; message: "${e.message}" },`,
          );
        }
        lines.push(`  ];`);
      } else {
        lines.push(`  errors: never[];`);
      }
      lines.push(`}`);
    }
    lines.push("");
  }

  if (routes.length > 0) {
    lines.push("// ── All routes union ──");
    lines.push("export type ApiRoutes =");
    routes.forEach((r, i) => {
      lines.push(`  ${i === 0 ? " " : "|"} ${routeToTypeName(r)}`);
    });
    lines.push(";");
  }

  return lines.join("\n");
}

function renderJson(routes: RouteDefinition[]): string {
  return JSON.stringify(routes, null, 2);
}

// ──────────────────────────────────────────────────────────────
// CLI entrypoint
// ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log(`
Usage:
  npx tsx scaffold-api-types.ts <routes-dir> [options]

Options:
  --entry <file>          Entry file to trace mount prefixes from (e.g. src/index.ts)
                          Auto-detected by walking up from routes-dir if omitted.
  --out <file>            Write output to file instead of stdout
  --format <format>       Output format: "ts" (default) | "json"
  --tsconfig <file>       Path to tsconfig.json (auto-detected if omitted)
  --help                  Show this help
    `);
    process.exit(0);
  }

  const routesDir = args[0] as string;
  if (!fs.existsSync(routesDir)) {
    console.error(`❌ Directory not found: ${routesDir}`);
    process.exit(1);
  }

  const outIndex = args.indexOf("--out");
  const outFile: string | null =
    outIndex !== -1 ? (args[outIndex + 1] as string) : null;

  const formatIndex = args.indexOf("--format");
  const format: string =
    formatIndex !== -1 ? (args[formatIndex + 1] as string) : "ts";

  const tsconfigIndex = args.indexOf("--tsconfig");
  let tsconfigPath: string | null =
    tsconfigIndex !== -1 ? (args[tsconfigIndex + 1] as string) : null;

  if (!tsconfigPath) {
    let dir = path.resolve(routesDir);
    while (true) {
      const candidate = path.join(dir, "tsconfig.json");
      if (fs.existsSync(candidate)) {
        tsconfigPath = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  if (tsconfigPath) {
    console.error(`📋 tsconfig: ${path.relative(process.cwd(), tsconfigPath)}`);
  } else {
    console.error(`📋 tsconfig: not found — using defaults`);
  }

  const entryIndex = args.indexOf("--entry");
  let entryFile: string | null =
    entryIndex !== -1 ? path.resolve(args[entryIndex + 1] as string) : null;

  if (!entryFile) {
    let dir = path.resolve(routesDir);
    outer: while (true) {
      for (const candidate of [
        "index.ts",
        "index.js",
        "app.ts",
        "app.js",
        "main.ts",
        "server.ts",
      ]) {
        const p = path.join(dir, candidate);
        if (fs.existsSync(p)) {
          entryFile = p;
          break outer;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  if (entryFile) {
    console.error(`🚪 Entry: ${path.relative(process.cwd(), entryFile)}`);
  } else {
    console.error(`🚪 Entry: not found — fullPath will equal path`);
  }

  console.error(`📂 Scanning: ${routesDir}`);

  const files = collectFiles(routesDir).map((f) => path.resolve(f));
  console.error(`📄 Found ${files.length} file(s)`);

  console.error(`🔧 Building type checker...`);
  buildProgram(files, tsconfigPath);

  console.error(`🗺  Resolving mount prefixes...`);
  const mountPrefixMap = resolveMountPrefixes(entryFile);
  if (mountPrefixMap.size > 0) {
    for (const [file, prefix] of mountPrefixMap) {
      const rel = path.relative(process.cwd(), file);
      if (prefix) console.error(`     ${prefix}  ←  ${rel}`);
    }
  }

  const allRoutes: RouteDefinition[] = [];
  for (const file of files) {
    try {
      const mountPrefix = mountPrefixMap.get(file) ?? "";
      const routes = parseRouteFile(file, mountPrefix);
      if (routes.length > 0) {
        console.error(
          `  ✅ ${path.relative(process.cwd(), file)} → ${routes.length} route(s)`,
        );
        allRoutes.push(...routes);
      } else {
        console.error(
          `  ⚪ ${path.relative(process.cwd(), file)} → no routes found`,
        );
      }
    } catch (err) {
      console.error(`  ❌ ${file}: ${(err as Error).message}`);
    }
  }

  console.error(`\n🔍 Total routes: ${allRoutes.length}`);

  const output =
    format === "json" ? renderJson(allRoutes) : renderTypeScript(allRoutes);

  if (outFile) {
    const dir = path.dirname(outFile);
    if (dir !== "." && dir !== "") {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outFile as string, output, "utf-8");
    console.error(`✅ Written to: ${outFile}`);
  } else {
    process.stdout.write(output + "\n");
  }
}

export const generateApiContract = main;
