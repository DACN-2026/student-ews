INSERT INTO "permissions" (
  "id",
  "code",
  "name",
  "resource",
  "action",
  "is_assignable",
  "created_at"
)
VALUES (
  gen_random_uuid(),
  'academic_warning.case.assign',
  'Phân công hồ sơ can thiệp',
  'academic_warning_case',
  'assign',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "is_assignable" = true;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('admin', 'faculty_manager')
  AND p."code" = 'academic_warning.case.assign'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
