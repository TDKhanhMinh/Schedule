-- Allow one rule type to be instantiated for multiple scoped resources.
-- The same code and the same scope remain unique within a profile.

ALTER TABLE rule_definitions
  DROP CONSTRAINT IF EXISTS rule_definitions_rule_profile_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_definitions_profile_code_scope
  ON rule_definitions (rule_profile_id, code, scope);
