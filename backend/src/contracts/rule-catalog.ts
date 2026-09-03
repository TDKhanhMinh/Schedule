import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const RULE_CATALOG_VERSION = "RULE-CATALOG-1.0.0" as const;
export const RULE_CATALOG_SCHEMA_VERSION = "1.0" as const;

export type RuleCatalogGroup = "TEACHER" | "CLASS" | "SUBJECT" | "ROOM" | "SCHEDULE";
export type RuleCatalogResource = "SCHOOL" | "TEACHER" | "CLASS" | "SUBJECT" | "ROOM";
export type RuleCatalogParameterType =
  | "BOOLEAN"
  | "DAY_OF_WEEK"
  | "DAY_OF_WEEK_LIST"
  | "GRANULARITY"
  | "INTEGER"
  | "PERIOD"
  | "SHIFT_CODE"
  | "SLOT_ID"
  | "TEXT";
export type RuleCatalogImplementationStatus = "SUPPORTED" | "PLANNED";

export interface RuleCatalogParameter {
  key: string;
  label: string;
  type: RuleCatalogParameterType;
  required: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  options?: string[];
}

export interface RuleCatalogEntry {
  code: string;
  codePrefixes?: string[];
  name: string;
  group: RuleCatalogGroup;
  targetResources: RuleCatalogResource[];
  supportedKinds: Array<"HARD" | "SOFT">;
  defaultKind: "HARD" | "SOFT";
  defaultWeight?: number;
  implementationStatus: RuleCatalogImplementationStatus;
  handlerKey: string;
  description: string;
  parameters: RuleCatalogParameter[];
}

export interface RuleCatalog {
  catalogVersion: typeof RULE_CATALOG_VERSION;
  schemaVersion: typeof RULE_CATALOG_SCHEMA_VERSION;
  ruleTypes: RuleCatalogEntry[];
}

function readCatalog(): RuleCatalog {
  const catalogPath = resolve(__dirname, "../../contracts/rule-catalog.json");
  return JSON.parse(readFileSync(catalogPath, "utf8")) as RuleCatalog;
}

export const RULE_CATALOG = readCatalog();

function matchesEntry(entry: RuleCatalogEntry, code: string) {
  return entry.code === code || entry.codePrefixes?.some((prefix) => code.startsWith(prefix));
}

export function findRuleCatalogEntry(code: string) {
  const normalized = code.trim().toUpperCase();
  return RULE_CATALOG.ruleTypes.find((entry) => matchesEntry(entry, normalized));
}

export function isRuleCodeSupported(code: string) {
  return findRuleCatalogEntry(code)?.implementationStatus === "SUPPORTED";
}

export function assertKnownRuleCode(code: string) {
  const entry = findRuleCatalogEntry(code);
  if (!entry) throw new Error(`Mã quy tắc chưa được đăng ký: ${code}`);
  return entry;
}

export function validateRuleCatalog(catalog: RuleCatalog = RULE_CATALOG) {
  if (catalog.catalogVersion !== RULE_CATALOG_VERSION) throw new Error("Sai phiên bản Rule Catalog.");
  if (catalog.schemaVersion !== RULE_CATALOG_SCHEMA_VERSION) throw new Error("Sai phiên bản schema Rule Catalog.");
  const codes = catalog.ruleTypes.map((entry) => entry.code);
  if (new Set(codes).size !== codes.length) throw new Error("Rule Catalog không được lặp mã rule.");
  for (const entry of catalog.ruleTypes) {
    if (!entry.supportedKinds.includes(entry.defaultKind)) {
      throw new Error(`defaultKind không hợp lệ cho rule ${entry.code}.`);
    }
    if (entry.defaultKind === "SOFT" && entry.defaultWeight === undefined) {
      throw new Error(`Rule SOFT ${entry.code} phải có defaultWeight.`);
    }
    const parameterKeys = entry.parameters.map((parameter) => parameter.key);
    if (new Set(parameterKeys).size !== parameterKeys.length) {
      throw new Error(`Tham số bị lặp trong rule ${entry.code}.`);
    }
  }
  return catalog;
}

validateRuleCatalog();
