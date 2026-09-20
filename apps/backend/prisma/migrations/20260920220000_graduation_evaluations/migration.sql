CREATE TABLE "graduation_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "training_program_id" UUID,
  "cohort_id" UUID,
  "rule_code" VARCHAR(64) NOT NULL,
  "rule_name" VARCHAR(255) NOT NULL,
  "rule_type" VARCHAR(32) NOT NULL,
  "operator" VARCHAR(16) NOT NULL,
  "required_value" VARCHAR(128) NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "source_document" VARCHAR(500) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graduation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graduation_rules_status_check" CHECK ("status" IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX "graduation_rules_scope_code_version_key"
  ON "graduation_rules"("training_program_id", "cohort_id", "rule_code", "version");
CREATE INDEX "graduation_rules_scope_idx"
  ON "graduation_rules"("training_program_id", "cohort_id", "status", "version");

INSERT INTO "graduation_rules" (
  "training_program_id", "cohort_id", "rule_code", "rule_name", "rule_type",
  "operator", "required_value", "version", "source_document", "status"
)
VALUES
  (NULL, NULL, 'PROGRAM_COMPLETION', 'Hoàn thành cấu trúc chương trình đào tạo', 'CURRICULUM', '=', 'PASSED', 'REGULATION-BASE-v1', 'Quy chế đào tạo, Chương IV, Điều 27', 'active'),
  (NULL, NULL, 'CUMULATIVE_GPA', 'Điểm trung bình tích lũy hệ 4', 'GPA', '>=', '2.00', 'REGULATION-BASE-v1', 'Quy chế đào tạo, Chương IV, Điều 27', 'active'),
  (NULL, NULL, 'DISCIPLINE', 'Không trong thời gian đình chỉ học tập', 'STATUS', '=', 'CLEAR', 'REGULATION-BASE-v1', 'Quy chế đào tạo, Chương IV, Điều 27', 'active'),
  (NULL, NULL, 'LEGAL', 'Không bị truy cứu trách nhiệm hình sự', 'STATUS', '=', 'CLEAR', 'REGULATION-BASE-v1', 'Quy chế đào tạo, Chương IV, Điều 27', 'active'),
  (NULL, NULL, 'WHOLE_COURSE_TRAINING', 'Có kết quả rèn luyện toàn khóa', 'DATA', 'EXISTS', 'AVAILABLE', 'REGULATION-BASE-v1', 'Quy định đánh giá kết quả rèn luyện sinh viên Trường Đại học Đà Lạt', 'active');

INSERT INTO "graduation_rules" (
  "training_program_id", "cohort_id", "rule_code", "rule_name", "rule_type",
  "operator", "required_value", "version", "source_document", "status"
)
SELECT p."id", c."id", rule."rule_code", rule."rule_name", rule."rule_type",
       rule."operator", rule."required_value", 'CNTT-K44-2020-v1',
       'Chương trình giáo dục đại học ngành CNTT K44 năm 2020', 'active'
FROM "training_programs" p
CROSS JOIN "cohorts" c
CROSS JOIN (VALUES
  ('TOTAL_CREDITS', 'Tổng tín chỉ tích lũy', 'CREDIT', '>=', '150'),
  ('COMPULSORY_CREDITS', 'Tín chỉ bắt buộc', 'CREDIT', '>=', '104'),
  ('ELECTIVE_CREDITS', 'Tín chỉ tự chọn', 'CREDIT', '>=', '46'),
  ('PHYSICAL_EDUCATION', 'Chứng chỉ Giáo dục thể chất', 'CERTIFICATE', '=', 'PASSED'),
  ('NATIONAL_DEFENSE', 'Chứng chỉ Giáo dục quốc phòng và an ninh', 'CERTIFICATE', '=', 'PASSED'),
  ('FOREIGN_LANGUAGE', 'Chuẩn đầu ra ngoại ngữ', 'OUTCOME', '=', 'PASSED')
) AS rule("rule_code", "rule_name", "rule_type", "operator", "required_value")
WHERE c."s_cohort_code" = 'K44'
  AND p."deleted_at" IS NULL
  AND p."s_major" ILIKE '%Công nghệ Thông tin%';

CREATE TABLE "student_graduation_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "physical_education_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_AVAILABLE',
  "national_defense_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_AVAILABLE',
  "foreign_language_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_AVAILABLE',
  "discipline_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_AVAILABLE',
  "legal_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_AVAILABLE',
  "whole_course_training_score" DECIMAL(5,2),
  "training_classification" VARCHAR(64),
  "source_system" VARCHAR(128),
  "source_payload" JSONB NOT NULL DEFAULT '{}',
  "verified_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_graduation_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_graduation_requirements_student_id_key" UNIQUE ("student_id"),
  CONSTRAINT "student_graduation_requirements_certificate_check" CHECK (
    "physical_education_status" IN ('PASSED', 'NOT_PASSED', 'PENDING', 'NOT_AVAILABLE') AND
    "national_defense_status" IN ('PASSED', 'NOT_PASSED', 'PENDING', 'NOT_AVAILABLE') AND
    "foreign_language_status" IN ('PASSED', 'NOT_PASSED', 'PENDING', 'NOT_AVAILABLE')
  )
);
CREATE INDEX "student_graduation_requirements_updated_idx"
  ON "student_graduation_requirements"("updated_at" DESC);

CREATE TABLE "graduation_evaluations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "evaluation_code" VARCHAR(64) NOT NULL,
  "evaluation_name" VARCHAR(255) NOT NULL,
  "assessment_academic_term_id" UUID NOT NULL,
  "cohort_id" UUID NOT NULL,
  "training_program_id" UUID NOT NULL,
  "specialization" VARCHAR(255),
  "target_type" VARCHAR(32) NOT NULL DEFAULT 'all_students',
  "completion_run_id" UUID,
  "evaluated_by" UUID,
  "rule_version" VARCHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "total_students" INTEGER NOT NULL DEFAULT 0,
  "expected_eligible_students" INTEGER NOT NULL DEFAULT 0,
  "pending_grade_students" INTEGER NOT NULL DEFAULT 0,
  "pending_requirement_students" INTEGER NOT NULL DEFAULT 0,
  "not_eligible_students" INTEGER NOT NULL DEFAULT 0,
  "manual_review_students" INTEGER NOT NULL DEFAULT 0,
  "source_snapshot" JSONB NOT NULL DEFAULT '{}',
  "source_snapshot_hash" VARCHAR(64),
  "source_captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error_message" TEXT,
  "evaluated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graduation_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graduation_evaluations_evaluation_code_key" UNIQUE ("evaluation_code"),
  CONSTRAINT "graduation_evaluations_status_check" CHECK ("status" IN ('running', 'completed', 'failed'))
);
CREATE INDEX "graduation_evaluations_scope_idx"
  ON "graduation_evaluations"("cohort_id", "training_program_id", "assessment_academic_term_id", "created_at" DESC);
CREATE INDEX "graduation_evaluations_status_idx"
  ON "graduation_evaluations"("status", "created_at" DESC);

CREATE TABLE "graduation_evaluation_students" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "evaluation_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "class_id" UUID,
  "cohort_id" UUID,
  "s_student_id" VARCHAR(32) NOT NULL,
  "s_student_name" VARCHAR(320) NOT NULL,
  "s_class_name" VARCHAR(320),
  "s_program_code" VARCHAR(64),
  "total_credits" DECIMAL(8,2),
  "compulsory_credits" DECIMAL(8,2),
  "elective_credits" DECIMAL(8,2),
  "cumulative_gpa_4" DECIMAL(3,2),
  "curriculum_status" VARCHAR(24) NOT NULL,
  "physical_education_status" VARCHAR(24) NOT NULL,
  "national_defense_status" VARCHAR(24) NOT NULL,
  "foreign_language_status" VARCHAR(24) NOT NULL,
  "training_status" VARCHAR(24) NOT NULL,
  "discipline_status" VARCHAR(32) NOT NULL,
  "legal_status" VARCHAR(32) NOT NULL,
  "whole_course_training_score" DECIMAL(5,2),
  "missing_required_courses" INTEGER NOT NULL DEFAULT 0,
  "missing_elective_credits" INTEGER NOT NULL DEFAULT 0,
  "pending_result_courses" INTEGER NOT NULL DEFAULT 0,
  "final_status" VARCHAR(32) NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]',
  "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graduation_evaluation_students_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graduation_evaluation_students_run_student_key" UNIQUE ("evaluation_id", "student_id"),
  CONSTRAINT "graduation_evaluation_students_status_check" CHECK ("final_status" IN ('EXPECTED_ELIGIBLE', 'PENDING_GRADE', 'PENDING_REQUIREMENT', 'NOT_ELIGIBLE', 'MANUAL_REVIEW'))
);
CREATE INDEX "graduation_evaluation_students_status_idx"
  ON "graduation_evaluation_students"("evaluation_id", "final_status", "s_student_id");
CREATE INDEX "graduation_evaluation_students_class_idx"
  ON "graduation_evaluation_students"("evaluation_id", "class_id", "s_student_id");

CREATE TABLE "graduation_evaluation_details" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "evaluation_student_id" UUID NOT NULL,
  "rule_code" VARCHAR(64) NOT NULL,
  "rule_name" VARCHAR(255) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "required_value" VARCHAR(255),
  "actual_value" VARCHAR(255),
  "result" VARCHAR(24) NOT NULL,
  "reason" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "graduation_evaluation_details_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graduation_evaluation_details_student_rule_key" UNIQUE ("evaluation_student_id", "rule_code"),
  CONSTRAINT "graduation_evaluation_details_result_check" CHECK ("result" IN ('PASS', 'FAIL', 'PENDING', 'NOT_AVAILABLE'))
);
CREATE INDEX "graduation_evaluation_details_result_idx"
  ON "graduation_evaluation_details"("evaluation_student_id", "result", "category");

ALTER TABLE "student_graduation_requirements"
  ADD CONSTRAINT "student_graduation_requirements_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "graduation_evaluations"
  ADD CONSTRAINT "graduation_evaluations_completion_run_id_fkey"
  FOREIGN KEY ("completion_run_id") REFERENCES "training_progress_completion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "graduation_evaluation_students"
  ADD CONSTRAINT "graduation_evaluation_students_evaluation_id_fkey"
  FOREIGN KEY ("evaluation_id") REFERENCES "graduation_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "graduation_evaluation_students"
  ADD CONSTRAINT "graduation_evaluation_students_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "graduation_evaluation_details"
  ADD CONSTRAINT "graduation_evaluation_details_student_id_fkey"
  FOREIGN KEY ("evaluation_student_id") REFERENCES "graduation_evaluation_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "name", "resource", "action", "is_assignable")
VALUES
  (gen_random_uuid(), 'graduation.read', 'Xem dự kiến tốt nghiệp', 'graduation', 'read', true),
  (gen_random_uuid(), 'graduation.evaluate', 'Chạy đánh giá tốt nghiệp', 'graduation', 'evaluate', true),
  (gen_random_uuid(), 'graduation.export', 'Xuất kết quả dự kiến tốt nghiệp', 'graduation', 'export', true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "is_assignable" = true;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('admin', 'class_advisor')
  AND p."code" IN ('graduation.read', 'graduation.export')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'admin'
  AND p."code" = 'graduation.evaluate'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
