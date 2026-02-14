-- Phase 4 Step 4: safe policy dedupe
-- Replace broad ALL manage policies (that overlap SELECT read policies)
-- with explicit INSERT/UPDATE/DELETE policies.
-- Goal: reduce multiple permissive policy warnings without changing functional access.

-- user_access_scopes
DROP POLICY IF EXISTS "admins can manage access scopes" ON public.user_access_scopes;
CREATE POLICY "admins can insert access scopes"
ON public.user_access_scopes
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can update access scopes"
ON public.user_access_scopes
FOR UPDATE TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can delete access scopes"
ON public.user_access_scopes
FOR DELETE TO authenticated
USING (public.is_admin_user());

-- projects
DROP POLICY IF EXISTS "project admins can manage projects" ON public.projects;
CREATE POLICY "project admins can insert projects"
ON public.projects
FOR INSERT TO authenticated
WITH CHECK (public.has_project_role(id, ARRAY['admin']::public.app_role[]));
CREATE POLICY "project admins can update projects"
ON public.projects
FOR UPDATE TO authenticated
USING (public.has_project_role(id, ARRAY['admin']::public.app_role[]))
WITH CHECK (public.has_project_role(id, ARRAY['admin']::public.app_role[]));
CREATE POLICY "project admins can delete projects"
ON public.projects
FOR DELETE TO authenticated
USING (public.has_project_role(id, ARRAY['admin']::public.app_role[]));

-- vendors
DROP POLICY IF EXISTS "pm admin buyer can manage vendors" ON public.vendors;
CREATE POLICY "pm admin buyer can insert vendors"
ON public.vendors
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager','buyer')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_access_scopes uas
    WHERE uas.user_id = (SELECT auth.uid())
      AND uas.active = true
      AND uas.scope_role IN ('admin','project_manager','buyer')
  )
);
CREATE POLICY "pm admin buyer can update vendors"
ON public.vendors
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager','buyer')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_access_scopes uas
    WHERE uas.user_id = (SELECT auth.uid())
      AND uas.active = true
      AND uas.scope_role IN ('admin','project_manager','buyer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager','buyer')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_access_scopes uas
    WHERE uas.user_id = (SELECT auth.uid())
      AND uas.active = true
      AND uas.scope_role IN ('admin','project_manager','buyer')
  )
);
CREATE POLICY "pm admin buyer can delete vendors"
ON public.vendors
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager','buyer')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_access_scopes uas
    WHERE uas.user_id = (SELECT auth.uid())
      AND uas.active = true
      AND uas.scope_role IN ('admin','project_manager','buyer')
  )
);

-- income_lines
DROP POLICY IF EXISTS "pm admin can manage income lines" ON public.income_lines;
CREATE POLICY "pm admin can insert income lines"
ON public.income_lines
FOR INSERT TO public
WITH CHECK (
  ((project_id IS NOT NULL) AND public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]))
  OR ((organization_id IS NOT NULL) AND public.has_org_role(organization_id, ARRAY['admin','project_manager']::public.app_role[]))
);
CREATE POLICY "pm admin can update income lines"
ON public.income_lines
FOR UPDATE TO public
USING (
  ((project_id IS NOT NULL) AND public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]))
  OR ((organization_id IS NOT NULL) AND public.has_org_role(organization_id, ARRAY['admin','project_manager']::public.app_role[]))
)
WITH CHECK (
  ((project_id IS NOT NULL) AND public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]))
  OR ((organization_id IS NOT NULL) AND public.has_org_role(organization_id, ARRAY['admin','project_manager']::public.app_role[]))
);
CREATE POLICY "pm admin can delete income lines"
ON public.income_lines
FOR DELETE TO public
USING (
  ((project_id IS NOT NULL) AND public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]))
  OR ((organization_id IS NOT NULL) AND public.has_org_role(organization_id, ARRAY['admin','project_manager']::public.app_role[]))
);

-- cc_statement_months
DROP POLICY IF EXISTS "pm admin can manage statement months" ON public.cc_statement_months;
CREATE POLICY "pm admin can insert statement months"
ON public.cc_statement_months
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);
CREATE POLICY "pm admin can update statement months"
ON public.cc_statement_months
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);
CREATE POLICY "pm admin can delete statement months"
ON public.cc_statement_months
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);

-- cc_statement_lines
DROP POLICY IF EXISTS "pm admin can manage statement lines" ON public.cc_statement_lines;
CREATE POLICY "pm admin can insert statement lines"
ON public.cc_statement_lines
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);
CREATE POLICY "pm admin can update statement lines"
ON public.cc_statement_lines
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);
CREATE POLICY "pm admin can delete statement lines"
ON public.cc_statement_lines
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.user_id = (SELECT auth.uid())
      AND pm.role IN ('admin','project_manager')
  )
);

-- contracts
DROP POLICY IF EXISTS "pm admin can manage contracts" ON public.contracts;
CREATE POLICY "pm admin can insert contracts"
ON public.contracts
FOR INSERT TO authenticated
WITH CHECK (public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]));
CREATE POLICY "pm admin can update contracts"
ON public.contracts
FOR UPDATE TO authenticated
USING (public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]))
WITH CHECK (public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]));
CREATE POLICY "pm admin can delete contracts"
ON public.contracts
FOR DELETE TO authenticated
USING (public.has_project_role(project_id, ARRAY['admin','project_manager']::public.app_role[]));

-- contract_installments
DROP POLICY IF EXISTS "pm admin can manage contract installments" ON public.contract_installments;
CREATE POLICY "pm admin can insert contract installments"
ON public.contract_installments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = contract_installments.contract_id
      AND public.has_project_role(c.project_id, ARRAY['admin','project_manager']::public.app_role[])
  )
);
CREATE POLICY "pm admin can update contract installments"
ON public.contract_installments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = contract_installments.contract_id
      AND public.has_project_role(c.project_id, ARRAY['admin','project_manager']::public.app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = contract_installments.contract_id
      AND public.has_project_role(c.project_id, ARRAY['admin','project_manager']::public.app_role[])
  )
);
CREATE POLICY "pm admin can delete contract installments"
ON public.contract_installments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = contract_installments.contract_id
      AND public.has_project_role(c.project_id, ARRAY['admin','project_manager']::public.app_role[])
  )
);

-- account_codes
DROP POLICY IF EXISTS "admins can manage account codes" ON public.account_codes;
CREATE POLICY "admins can insert account codes"
ON public.account_codes
FOR INSERT TO public
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can update account codes"
ON public.account_codes
FOR UPDATE TO public
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can delete account codes"
ON public.account_codes
FOR DELETE TO public
USING (public.is_admin_user());

-- fiscal_years
DROP POLICY IF EXISTS "admins can manage fiscal years" ON public.fiscal_years;
CREATE POLICY "admins can insert fiscal years"
ON public.fiscal_years
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can update fiscal years"
ON public.fiscal_years
FOR UPDATE TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can delete fiscal years"
ON public.fiscal_years
FOR DELETE TO authenticated
USING (public.is_admin_user());

-- organizations
DROP POLICY IF EXISTS "admins can manage organizations" ON public.organizations;
CREATE POLICY "admins can insert organizations"
ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can update organizations"
ON public.organizations
FOR UPDATE TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can delete organizations"
ON public.organizations
FOR DELETE TO authenticated
USING (public.is_admin_user());

-- production_categories
DROP POLICY IF EXISTS "admins can manage production categories" ON public.production_categories;
CREATE POLICY "admins can insert production categories"
ON public.production_categories
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can update production categories"
ON public.production_categories
FOR UPDATE TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
CREATE POLICY "admins can delete production categories"
ON public.production_categories
FOR DELETE TO authenticated
USING (public.is_admin_user());
