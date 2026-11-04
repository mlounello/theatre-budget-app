const NON_ENCUMBRANCE_RULE_CLASSES = new Set(["INNI", "INNC"]);

export function bannerRuleRelievesEncumbrance(ruleClassCode: string | null | undefined): boolean {
  const normalized = String(ruleClassCode ?? "").trim().toUpperCase();
  if (!normalized) return true;
  return !normalized.startsWith("AD") && !NON_ENCUMBRANCE_RULE_CLASSES.has(normalized);
}
