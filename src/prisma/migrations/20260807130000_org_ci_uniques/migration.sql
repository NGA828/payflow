-- Case-insensitive name uniqueness for ACTIVE org entities.
-- Prisma's @@unique is case-sensitive in PostgreSQL; these expression indexes
-- enforce "Finance" == "finance", and archiving an entity frees its name.
CREATE UNIQUE INDEX department_company_name_ci
  ON "Department" ("companyId", lower("name"))
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX position_company_dept_title_ci
  ON "Position" ("companyId", "departmentId", lower("title"))
  WHERE "status" = 'ACTIVE';
