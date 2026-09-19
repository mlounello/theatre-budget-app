// Generated from the live app_theatre_budget schema. Run scripts/generate-database-types.mjs to refresh.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericTableDefinition = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: Array<{ foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }>;
};

type EmptySchema = {
  Tables: Record<string, GenericTableDefinition>;
  Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
};

export type Database = {
  public: EmptySchema;
  core: EmptySchema;
  app_production_management: EmptySchema;
  app_theatre_budget: {
    Tables: {
      "account_codes": {
        Row: {
          "id": string;
          "code": string;
          "category": string;
          "name": string;
          "active": boolean;
          "created_at": string;
          "is_revenue": boolean;
        };
        Insert: {
          "id"?: string;
          "code"?: string;
          "category"?: string;
          "name"?: string;
          "active"?: boolean;
          "created_at"?: string;
          "is_revenue"?: boolean;
        };
        Update: {
          "id"?: string;
          "code"?: string;
          "category"?: string;
          "name"?: string;
          "active"?: boolean;
          "created_at"?: string;
          "is_revenue"?: boolean;
        };
        Relationships: [

        ];
      };
      "admin_impersonation_audit": {
        Row: {
          "id": string;
          "actor_user_id": string;
          "target_user_id": string;
          "event_type": string;
          "ip_address": string | null;
          "user_agent": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "actor_user_id"?: string;
          "target_user_id"?: string;
          "event_type"?: string;
          "ip_address"?: string | null;
          "user_agent"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "actor_user_id"?: string;
          "target_user_id"?: string;
          "event_type"?: string;
          "ip_address"?: string | null;
          "user_agent"?: string | null;
          "created_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "admin_impersonation_audit_actor_user_id_fkey"; columns: ["actor_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "admin_impersonation_audit_target_user_id_fkey"; columns: ["target_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "app_settings": {
        Row: {
          "id": number | string;
          "planning_requests_enabled": boolean;
          "updated_at": string;
          "updated_by": string | null;
        };
        Insert: {
          "id"?: number | string;
          "planning_requests_enabled"?: boolean;
          "updated_at"?: string;
          "updated_by"?: string | null;
        };
        Update: {
          "id"?: number | string;
          "planning_requests_enabled"?: boolean;
          "updated_at"?: string;
          "updated_by"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "app_settings_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "budget_plan_months": {
        Row: {
          "id": string;
          "budget_plan_id": string;
          "month_start": string;
          "fiscal_month_index": number | string;
          "amount": number | string;
          "percent": number | string;
          "source": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "budget_plan_id"?: string;
          "month_start"?: string;
          "fiscal_month_index"?: number | string;
          "amount"?: number | string;
          "percent"?: number | string;
          "source"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "budget_plan_id"?: string;
          "month_start"?: string;
          "fiscal_month_index"?: number | string;
          "amount"?: number | string;
          "percent"?: number | string;
          "source"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "budget_plan_months_budget_plan_id_fkey"; columns: ["budget_plan_id"]; isOneToOne: false; referencedRelation: "budget_plans"; referencedColumns: ["id"] }
        ];
      };
      "budget_plans": {
        Row: {
          "id": string;
          "fiscal_year_id": string;
          "organization_id": string;
          "account_code_id": string;
          "annual_amount": number | string;
          "source_fiscal_year_id": string | null;
          "created_by_user_id": string;
          "updated_by_user_id": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "annual_amount"?: number | string;
          "source_fiscal_year_id"?: string | null;
          "created_by_user_id"?: string;
          "updated_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "annual_amount"?: number | string;
          "source_fiscal_year_id"?: string | null;
          "created_by_user_id"?: string;
          "updated_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "budget_plans_account_code_id_fkey"; columns: ["account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "budget_plans_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "budget_plans_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "budget_plans_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "budget_plans_source_fiscal_year_id_fkey"; columns: ["source_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "budget_plans_updated_by_user_id_fkey"; columns: ["updated_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "budget_template_lines": {
        Row: {
          "id": string;
          "template_id": string;
          "budget_code": string;
          "category": string;
          "line_name": string;
          "default_allocated_amount": number | string;
          "sort_order": number | string;
        };
        Insert: {
          "id"?: string;
          "template_id"?: string;
          "budget_code"?: string;
          "category"?: string;
          "line_name"?: string;
          "default_allocated_amount"?: number | string;
          "sort_order"?: number | string;
        };
        Update: {
          "id"?: string;
          "template_id"?: string;
          "budget_code"?: string;
          "category"?: string;
          "line_name"?: string;
          "default_allocated_amount"?: number | string;
          "sort_order"?: number | string;
        };
        Relationships: [
          { foreignKeyName: "budget_template_lines_template_id_fkey"; columns: ["template_id"]; isOneToOne: false; referencedRelation: "budget_templates"; referencedColumns: ["id"] }
        ];
      };
      "budget_templates": {
        Row: {
          "id": string;
          "name": string;
          "description": string | null;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "description"?: string | null;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "description"?: string | null;
          "created_at"?: string;
        };
        Relationships: [

        ];
      };
      "cc_statement_lines": {
        Row: {
          "id": string;
          "statement_month_id": string;
          "project_budget_line_id": string | null;
          "amount": number | string;
          "note": string | null;
          "matched_purchase_ids": unknown[];
          "created_at": string;
          "fiscal_year_id": string;
          "organization_id": string | null;
          "banner_account_code_id": string | null;
        };
        Insert: {
          "id"?: string;
          "statement_month_id"?: string;
          "project_budget_line_id"?: string | null;
          "amount"?: number | string;
          "note"?: string | null;
          "matched_purchase_ids"?: unknown[];
          "created_at"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string | null;
          "banner_account_code_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "statement_month_id"?: string;
          "project_budget_line_id"?: string | null;
          "amount"?: number | string;
          "note"?: string | null;
          "matched_purchase_ids"?: unknown[];
          "created_at"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string | null;
          "banner_account_code_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "cc_statement_lines_banner_account_code_id_fkey"; columns: ["banner_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_lines_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_lines_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_lines_project_budget_line_id_fkey"; columns: ["project_budget_line_id"]; isOneToOne: false; referencedRelation: "project_budget_lines"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_lines_statement_month_id_fkey"; columns: ["statement_month_id"]; isOneToOne: false; referencedRelation: "cc_statement_months"; referencedColumns: ["id"] }
        ];
      };
      "cc_statement_months": {
        Row: {
          "id": string;
          "project_id": string | null;
          "credit_card_id": string;
          "statement_month": string;
          "posted_at": string | null;
          "created_by_user_id": string | null;
          "created_at": string;
          "posted_to_banner_at": string | null;
          "fiscal_year_id": string;
          "organization_id": string | null;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string | null;
          "credit_card_id"?: string;
          "statement_month"?: string;
          "posted_at"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "posted_to_banner_at"?: string | null;
          "fiscal_year_id"?: string;
          "organization_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "project_id"?: string | null;
          "credit_card_id"?: string;
          "statement_month"?: string;
          "posted_at"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "posted_to_banner_at"?: string | null;
          "fiscal_year_id"?: string;
          "organization_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "cc_statement_months_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_months_credit_card_id_fkey"; columns: ["credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_months_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_months_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "cc_statement_months_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      "contract_installments": {
        Row: {
          "id": string;
          "contract_id": string;
          "purchase_id": string | null;
          "installment_number": number | string;
          "installment_amount": number | string;
          "status": string;
          "check_request_submitted_on": string | null;
          "check_paid_on": string | null;
          "created_at": string;
          "updated_at": string;
          "due_date": string | null;
          "ap_receive_by": string | null;
          "mail_by": string | null;
          "check_request_foapal_id": string | null;
          "check_request_handling": string;
          "check_request_other_location": string | null;
          "vendor_address1": string | null;
          "vendor_address2": string | null;
          "vendor_address3": string | null;
          "tax_id_encrypted": string | null;
          "tax_id_last4": string | null;
          "payment_channel": string;
        };
        Insert: {
          "id"?: string;
          "contract_id"?: string;
          "purchase_id"?: string | null;
          "installment_number"?: number | string;
          "installment_amount"?: number | string;
          "status"?: string;
          "check_request_submitted_on"?: string | null;
          "check_paid_on"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "check_request_foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "payment_channel"?: string;
        };
        Update: {
          "id"?: string;
          "contract_id"?: string;
          "purchase_id"?: string | null;
          "installment_number"?: number | string;
          "installment_amount"?: number | string;
          "status"?: string;
          "check_request_submitted_on"?: string | null;
          "check_paid_on"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "check_request_foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "payment_channel"?: string;
        };
        Relationships: [
          { foreignKeyName: "contract_installments_check_request_foapal_id_fkey"; columns: ["check_request_foapal_id"]; isOneToOne: false; referencedRelation: "foapals"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_installments_contract_id_fkey"; columns: ["contract_id"]; isOneToOne: false; referencedRelation: "contracts"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_installments_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "contract_productions": {
        Row: {
          "contract_id": string;
          "project_id": string;
          "created_at": string;
        };
        Insert: {
          "contract_id"?: string;
          "project_id"?: string;
          "created_at"?: string;
        };
        Update: {
          "contract_id"?: string;
          "project_id"?: string;
          "created_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "contract_productions_contract_id_fkey"; columns: ["contract_id"]; isOneToOne: false; referencedRelation: "contracts"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_productions_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      "contract_union_contributions": {
        Row: {
          "id": string;
          "contract_id": string;
          "union_agreement_fund_id": string | null;
          "union_fund_id": string | null;
          "purchase_id": string | null;
          "fund_name_snapshot": string;
          "vendor_number_snapshot": string | null;
          "foapal_id_snapshot": string | null;
          "check_request_handling_snapshot": string;
          "check_request_other_location_snapshot": string | null;
          "vendor_address1_snapshot": string | null;
          "vendor_address2_snapshot": string | null;
          "vendor_address3_snapshot": string | null;
          "tax_id_encrypted_snapshot": string | null;
          "tax_id_last4_snapshot": string | null;
          "contribution_type": string;
          "percentage": number | string;
          "calculation_base": number | string;
          "amount": number | string;
          "due_date": string | null;
          "ap_receive_by": string | null;
          "mail_by": string | null;
          "status": string;
          "check_request_submitted_on": string | null;
          "check_paid_on": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "contract_id"?: string;
          "union_agreement_fund_id"?: string | null;
          "union_fund_id"?: string | null;
          "purchase_id"?: string | null;
          "fund_name_snapshot"?: string;
          "vendor_number_snapshot"?: string | null;
          "foapal_id_snapshot"?: string | null;
          "check_request_handling_snapshot"?: string;
          "check_request_other_location_snapshot"?: string | null;
          "vendor_address1_snapshot"?: string | null;
          "vendor_address2_snapshot"?: string | null;
          "vendor_address3_snapshot"?: string | null;
          "tax_id_encrypted_snapshot"?: string | null;
          "tax_id_last4_snapshot"?: string | null;
          "contribution_type"?: string;
          "percentage"?: number | string;
          "calculation_base"?: number | string;
          "amount"?: number | string;
          "due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "status"?: string;
          "check_request_submitted_on"?: string | null;
          "check_paid_on"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "contract_id"?: string;
          "union_agreement_fund_id"?: string | null;
          "union_fund_id"?: string | null;
          "purchase_id"?: string | null;
          "fund_name_snapshot"?: string;
          "vendor_number_snapshot"?: string | null;
          "foapal_id_snapshot"?: string | null;
          "check_request_handling_snapshot"?: string;
          "check_request_other_location_snapshot"?: string | null;
          "vendor_address1_snapshot"?: string | null;
          "vendor_address2_snapshot"?: string | null;
          "vendor_address3_snapshot"?: string | null;
          "tax_id_encrypted_snapshot"?: string | null;
          "tax_id_last4_snapshot"?: string | null;
          "contribution_type"?: string;
          "percentage"?: number | string;
          "calculation_base"?: number | string;
          "amount"?: number | string;
          "due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "status"?: string;
          "check_request_submitted_on"?: string | null;
          "check_paid_on"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "contract_union_contributions_contract_id_fkey"; columns: ["contract_id"]; isOneToOne: false; referencedRelation: "contracts"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_union_contributions_foapal_id_snapshot_fkey"; columns: ["foapal_id_snapshot"]; isOneToOne: false; referencedRelation: "foapals"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_union_contributions_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_union_contributions_union_agreement_fund_id_fkey"; columns: ["union_agreement_fund_id"]; isOneToOne: false; referencedRelation: "union_agreement_funds"; referencedColumns: ["id"] },
          { foreignKeyName: "contract_union_contributions_union_fund_id_fkey"; columns: ["union_fund_id"]; isOneToOne: false; referencedRelation: "union_funds"; referencedColumns: ["id"] }
        ];
      };
      "contracts": {
        Row: {
          "id": string;
          "fiscal_year_id": string | null;
          "organization_id": string | null;
          "project_id": string;
          "banner_account_code_id": string;
          "production_category_id": string | null;
          "entered_by_user_id": string | null;
          "contractor_name": string;
          "contractor_employee_id": string | null;
          "contractor_email": string | null;
          "contractor_phone": string | null;
          "contract_value": number | string;
          "installment_count": number | string;
          "workflow_status": string;
          "notes": string | null;
          "created_at": string;
          "updated_at": string;
          "contract_number": string | null;
          "contract_role": string | null;
          "check_request_foapal_id": string | null;
          "check_request_handling": string;
          "check_request_other_location": string | null;
          "vendor_address1": string | null;
          "vendor_address2": string | null;
          "vendor_address3": string | null;
          "tax_id_encrypted": string | null;
          "tax_id_last4": string | null;
          "guest_artist_id": string | null;
          "production_project_id": string | null;
          "contract_session": unknown[];
          "is_union": boolean;
          "union_agreement_id": string | null;
          "union_agreement_name_snapshot": string | null;
          "union_signature_status": string;
          "engagement_type": string;
          "compensation_basis": string;
          "hr_onboarding_status": string;
          "hr_onboarding_reference": string | null;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "project_id"?: string;
          "banner_account_code_id"?: string;
          "production_category_id"?: string | null;
          "entered_by_user_id"?: string | null;
          "contractor_name"?: string;
          "contractor_employee_id"?: string | null;
          "contractor_email"?: string | null;
          "contractor_phone"?: string | null;
          "contract_value"?: number | string;
          "installment_count"?: number | string;
          "workflow_status"?: string;
          "notes"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "contract_number"?: string | null;
          "contract_role"?: string | null;
          "check_request_foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "guest_artist_id"?: string | null;
          "production_project_id"?: string | null;
          "contract_session"?: unknown[];
          "is_union"?: boolean;
          "union_agreement_id"?: string | null;
          "union_agreement_name_snapshot"?: string | null;
          "union_signature_status"?: string;
          "engagement_type"?: string;
          "compensation_basis"?: string;
          "hr_onboarding_status"?: string;
          "hr_onboarding_reference"?: string | null;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "project_id"?: string;
          "banner_account_code_id"?: string;
          "production_category_id"?: string | null;
          "entered_by_user_id"?: string | null;
          "contractor_name"?: string;
          "contractor_employee_id"?: string | null;
          "contractor_email"?: string | null;
          "contractor_phone"?: string | null;
          "contract_value"?: number | string;
          "installment_count"?: number | string;
          "workflow_status"?: string;
          "notes"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "contract_number"?: string | null;
          "contract_role"?: string | null;
          "check_request_foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "guest_artist_id"?: string | null;
          "production_project_id"?: string | null;
          "contract_session"?: unknown[];
          "is_union"?: boolean;
          "union_agreement_id"?: string | null;
          "union_agreement_name_snapshot"?: string | null;
          "union_signature_status"?: string;
          "engagement_type"?: string;
          "compensation_basis"?: string;
          "hr_onboarding_status"?: string;
          "hr_onboarding_reference"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "contracts_banner_account_code_id_fkey"; columns: ["banner_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_check_request_foapal_id_fkey"; columns: ["check_request_foapal_id"]; isOneToOne: false; referencedRelation: "foapals"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_entered_by_user_id_fkey"; columns: ["entered_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_guest_artist_id_fkey"; columns: ["guest_artist_id"]; isOneToOne: false; referencedRelation: "guest_artists"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_production_project_id_fkey"; columns: ["production_project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "contracts_union_agreement_id_fkey"; columns: ["union_agreement_id"]; isOneToOne: false; referencedRelation: "union_agreements"; referencedColumns: ["id"] }
        ];
      };
      "credit_cards": {
        Row: {
          "id": string;
          "nickname": string;
          "masked_number": string | null;
          "active": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "nickname"?: string;
          "masked_number"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "nickname"?: string;
          "masked_number"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
        };
        Relationships: [

        ];
      };
      "expense_claims": {
        Row: {
          "id": string;
          "fiscal_year_id": string;
          "project_id": string | null;
          "organization_id": string;
          "credit_card_id": string | null;
          "claim_number": string;
          "claim_type": string;
          "claim_month": string | null;
          "status": string;
          "authorized_amount": number | string | null;
          "settled_amount": number | string | null;
          "authorization_claim_id": string | null;
          "overage_explanation": string | null;
          "notes": string | null;
          "entered_by_user_id": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "project_id"?: string | null;
          "organization_id"?: string;
          "credit_card_id"?: string | null;
          "claim_number"?: string;
          "claim_type"?: string;
          "claim_month"?: string | null;
          "status"?: string;
          "authorized_amount"?: number | string | null;
          "settled_amount"?: number | string | null;
          "authorization_claim_id"?: string | null;
          "overage_explanation"?: string | null;
          "notes"?: string | null;
          "entered_by_user_id"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "project_id"?: string | null;
          "organization_id"?: string;
          "credit_card_id"?: string | null;
          "claim_number"?: string;
          "claim_type"?: string;
          "claim_month"?: string | null;
          "status"?: string;
          "authorized_amount"?: number | string | null;
          "settled_amount"?: number | string | null;
          "authorization_claim_id"?: string | null;
          "overage_explanation"?: string | null;
          "notes"?: string | null;
          "entered_by_user_id"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "expense_claims_authorization_claim_id_fkey"; columns: ["authorization_claim_id"]; isOneToOne: false; referencedRelation: "expense_claims"; referencedColumns: ["id"] },
          { foreignKeyName: "expense_claims_credit_card_id_fkey"; columns: ["credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["id"] },
          { foreignKeyName: "expense_claims_entered_by_user_id_fkey"; columns: ["entered_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "expense_claims_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "expense_claims_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "expense_claims_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      "fiscal_year_assignment_conflicts": {
        Row: {
          "id": string;
          "entity_table": string;
          "entity_id": string;
          "conflict_type": string;
          "project_fiscal_year_id": string | null;
          "organization_fiscal_year_id": string | null;
          "explicit_fiscal_year_id": string | null;
          "proposed_fiscal_year_id": string | null;
          "details": Json;
          "status": string;
          "resolution_note": string | null;
          "resolved_fiscal_year_id": string | null;
          "resolved_by_user_id": string | null;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "entity_table"?: string;
          "entity_id"?: string;
          "conflict_type"?: string;
          "project_fiscal_year_id"?: string | null;
          "organization_fiscal_year_id"?: string | null;
          "explicit_fiscal_year_id"?: string | null;
          "proposed_fiscal_year_id"?: string | null;
          "details"?: Json;
          "status"?: string;
          "resolution_note"?: string | null;
          "resolved_fiscal_year_id"?: string | null;
          "resolved_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "entity_table"?: string;
          "entity_id"?: string;
          "conflict_type"?: string;
          "project_fiscal_year_id"?: string | null;
          "organization_fiscal_year_id"?: string | null;
          "explicit_fiscal_year_id"?: string | null;
          "proposed_fiscal_year_id"?: string | null;
          "details"?: Json;
          "status"?: string;
          "resolution_note"?: string | null;
          "resolved_fiscal_year_id"?: string | null;
          "resolved_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "fiscal_year_assignment_conflic_organization_fiscal_year_id_fkey"; columns: ["organization_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_assignment_conflicts_explicit_fiscal_year_id_fkey"; columns: ["explicit_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_assignment_conflicts_project_fiscal_year_id_fkey"; columns: ["project_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_assignment_conflicts_proposed_fiscal_year_id_fkey"; columns: ["proposed_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_assignment_conflicts_resolved_by_user_id_fkey"; columns: ["resolved_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_assignment_conflicts_resolved_fiscal_year_id_fkey"; columns: ["resolved_fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] }
        ];
      };
      "fiscal_year_organizations": {
        Row: {
          "id": string;
          "fiscal_year_id": string;
          "organization_id": string;
          "active": boolean;
          "sort_order": number | string;
          "project_tracking_required": boolean;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "project_tracking_required"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "project_tracking_required"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "fiscal_year_organizations_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_year_organizations_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      "fiscal_years": {
        Row: {
          "id": string;
          "name": string;
          "start_date": string | null;
          "end_date": string | null;
          "status": string;
          "created_at": string;
          "sort_order": number | string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "start_date"?: string | null;
          "end_date"?: string | null;
          "status"?: string;
          "created_at"?: string;
          "sort_order"?: number | string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "start_date"?: string | null;
          "end_date"?: string | null;
          "status"?: string;
          "created_at"?: string;
          "sort_order"?: number | string;
        };
        Relationships: [

        ];
      };
      "foapals": {
        Row: {
          "id": string;
          "fund_id": string;
          "organization_id": string;
          "program_id": string;
          "label": string | null;
          "active": boolean;
          "sort_order": number | string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "fund_id"?: string;
          "organization_id"?: string;
          "program_id"?: string;
          "label"?: string | null;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "fund_id"?: string;
          "organization_id"?: string;
          "program_id"?: string;
          "label"?: string | null;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "foapals_fund_id_fkey"; columns: ["fund_id"]; isOneToOne: false; referencedRelation: "funds"; referencedColumns: ["id"] },
          { foreignKeyName: "foapals_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "foapals_program_id_fkey"; columns: ["program_id"]; isOneToOne: false; referencedRelation: "programs"; referencedColumns: ["id"] }
        ];
      };
      "funds": {
        Row: {
          "id": string;
          "code": string;
          "name": string;
          "active": boolean;
          "sort_order": number | string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "code"?: string;
          "name"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "code"?: string;
          "name"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [

        ];
      };
      "guest_artists": {
        Row: {
          "id": string;
          "display_name": string;
          "vendor_number": string | null;
          "email": string | null;
          "phone": string | null;
          "default_foapal_id": string | null;
          "default_check_request_handling": string;
          "default_check_request_other_location": string | null;
          "vendor_address1": string | null;
          "vendor_address2": string | null;
          "vendor_address3": string | null;
          "tax_id_encrypted": string | null;
          "tax_id_last4": string | null;
          "notes": string | null;
          "active": boolean;
          "created_at": string;
          "updated_at": string;
          "is_union": boolean;
          "default_union_agreement_id": string | null;
        };
        Insert: {
          "id"?: string;
          "display_name"?: string;
          "vendor_number"?: string | null;
          "email"?: string | null;
          "phone"?: string | null;
          "default_foapal_id"?: string | null;
          "default_check_request_handling"?: string;
          "default_check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
          "is_union"?: boolean;
          "default_union_agreement_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "display_name"?: string;
          "vendor_number"?: string | null;
          "email"?: string | null;
          "phone"?: string | null;
          "default_foapal_id"?: string | null;
          "default_check_request_handling"?: string;
          "default_check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
          "is_union"?: boolean;
          "default_union_agreement_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "guest_artists_default_foapal_id_fkey"; columns: ["default_foapal_id"]; isOneToOne: false; referencedRelation: "foapals"; referencedColumns: ["id"] },
          { foreignKeyName: "guest_artists_default_union_agreement_id_fkey"; columns: ["default_union_agreement_id"]; isOneToOne: false; referencedRelation: "union_agreements"; referencedColumns: ["id"] }
        ];
      };
      "income_lines": {
        Row: {
          "id": string;
          "project_id": string | null;
          "line_name": string;
          "reference_number": string | null;
          "amount": number | string;
          "received_on": string | null;
          "created_by_user_id": string | null;
          "created_at": string;
          "income_type": string;
          "organization_id": string | null;
          "production_category_id": string | null;
          "banner_account_code_id": string | null;
          "fiscal_year_id": string;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string | null;
          "line_name"?: string;
          "reference_number"?: string | null;
          "amount"?: number | string;
          "received_on"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "income_type"?: string;
          "organization_id"?: string | null;
          "production_category_id"?: string | null;
          "banner_account_code_id"?: string | null;
          "fiscal_year_id"?: string;
        };
        Update: {
          "id"?: string;
          "project_id"?: string | null;
          "line_name"?: string;
          "reference_number"?: string | null;
          "amount"?: number | string;
          "received_on"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "income_type"?: string;
          "organization_id"?: string | null;
          "production_category_id"?: string | null;
          "banner_account_code_id"?: string | null;
          "fiscal_year_id"?: string;
        };
        Relationships: [
          { foreignKeyName: "income_lines_banner_account_code_id_fkey"; columns: ["banner_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "income_lines_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "income_lines_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "income_lines_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "income_lines_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "income_lines_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      "institutional_budget_commitments": {
        Row: {
          "id": string;
          "purchase_id": string;
          "purchase_allocation_id": string | null;
          "fiscal_year_id": string;
          "organization_id": string;
          "account_code_id": string;
          "budget_plan_month_id": string;
          "order_date": string;
          "committed_amount": number | string;
          "commitment_status": string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "purchase_id"?: string;
          "purchase_allocation_id"?: string | null;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "budget_plan_month_id"?: string;
          "order_date"?: string;
          "committed_amount"?: number | string;
          "commitment_status"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "purchase_id"?: string;
          "purchase_allocation_id"?: string | null;
          "fiscal_year_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "budget_plan_month_id"?: string;
          "order_date"?: string;
          "committed_amount"?: number | string;
          "commitment_status"?: string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "institutional_budget_commitments_account_code_id_fkey"; columns: ["account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "institutional_budget_commitments_budget_plan_month_id_fkey"; columns: ["budget_plan_month_id"]; isOneToOne: false; referencedRelation: "budget_plan_months"; referencedColumns: ["id"] },
          { foreignKeyName: "institutional_budget_commitments_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "institutional_budget_commitments_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "institutional_budget_commitments_purchase_allocation_id_fkey"; columns: ["purchase_allocation_id"]; isOneToOne: false; referencedRelation: "purchase_allocations"; referencedColumns: ["id"] },
          { foreignKeyName: "institutional_budget_commitments_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "organization_consolidation_map": {
        Row: {
          "id": string;
          "legacy_organization_id": string;
          "canonical_organization_id": string;
          "normalized_org_code": string;
          "canonical_display_name": string;
          "status": string;
          "decision_note": string | null;
          "created_at": string;
          "applied_at": string | null;
        };
        Insert: {
          "id"?: string;
          "legacy_organization_id"?: string;
          "canonical_organization_id"?: string;
          "normalized_org_code"?: string;
          "canonical_display_name"?: string;
          "status"?: string;
          "decision_note"?: string | null;
          "created_at"?: string;
          "applied_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "legacy_organization_id"?: string;
          "canonical_organization_id"?: string;
          "normalized_org_code"?: string;
          "canonical_display_name"?: string;
          "status"?: string;
          "decision_note"?: string | null;
          "created_at"?: string;
          "applied_at"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "organization_consolidation_map_canonical_organization_id_fkey"; columns: ["canonical_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "organization_consolidation_map_legacy_organization_id_fkey"; columns: ["legacy_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      "organization_reference_repoint_log": {
        Row: {
          "id": string;
          "mapping_id": string;
          "source_table": string;
          "source_column": string;
          "source_row_id": string;
          "original_organization_id": string;
          "canonical_organization_id": string;
          "fiscal_year_id": string | null;
          "metadata": Json;
          "repointed_at": string;
        };
        Insert: {
          "id"?: string;
          "mapping_id"?: string;
          "source_table"?: string;
          "source_column"?: string;
          "source_row_id"?: string;
          "original_organization_id"?: string;
          "canonical_organization_id"?: string;
          "fiscal_year_id"?: string | null;
          "metadata"?: Json;
          "repointed_at"?: string;
        };
        Update: {
          "id"?: string;
          "mapping_id"?: string;
          "source_table"?: string;
          "source_column"?: string;
          "source_row_id"?: string;
          "original_organization_id"?: string;
          "canonical_organization_id"?: string;
          "fiscal_year_id"?: string | null;
          "metadata"?: Json;
          "repointed_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "organization_reference_repoint_l_canonical_organization_id_fkey"; columns: ["canonical_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "organization_reference_repoint_lo_original_organization_id_fkey"; columns: ["original_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "organization_reference_repoint_log_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "organization_reference_repoint_log_mapping_id_fkey"; columns: ["mapping_id"]; isOneToOne: false; referencedRelation: "organization_consolidation_map"; referencedColumns: ["id"] }
        ];
      };
      "organizations": {
        Row: {
          "id": string;
          "fiscal_year_id": string | null;
          "name": string;
          "org_code": string;
          "created_at": string;
          "sort_order": number | string;
          "project_tracking_required": boolean;
          "active": boolean;
          "superseded_by_organization_id": string | null;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string | null;
          "name"?: string;
          "org_code"?: string;
          "created_at"?: string;
          "sort_order"?: number | string;
          "project_tracking_required"?: boolean;
          "active"?: boolean;
          "superseded_by_organization_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string | null;
          "name"?: string;
          "org_code"?: string;
          "created_at"?: string;
          "sort_order"?: number | string;
          "project_tracking_required"?: boolean;
          "active"?: boolean;
          "superseded_by_organization_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "organizations_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "organizations_superseded_by_organization_id_fkey"; columns: ["superseded_by_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      "production_categories": {
        Row: {
          "id": string;
          "name": string;
          "sort_order": number | string;
          "active": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "sort_order"?: number | string;
          "active"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "sort_order"?: number | string;
          "active"?: boolean;
          "created_at"?: string;
        };
        Relationships: [

        ];
      };
      "production_team_assignments": {
        Row: {
          "id": string;
          "project_id": string;
          "user_id": string | null;
          "profile_name": string;
          "profile_email": string | null;
          "production_role": string | null;
          "production_category_id": string | null;
          "budget_access_role": string;
          "derived_access_scope_id": string | null;
          "active": boolean;
          "last_invited_at": string | null;
          "created_by_user_id": string | null;
          "updated_by_user_id": string | null;
          "created_at": string;
          "updated_at": string;
          "source_app": string | null;
          "source_project_id": string | null;
          "source_assignment_id": string | null;
          "source_person_id": string | null;
          "source_access_scope_managed": boolean;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string;
          "user_id"?: string | null;
          "profile_name"?: string;
          "profile_email"?: string | null;
          "production_role"?: string | null;
          "production_category_id"?: string | null;
          "budget_access_role"?: string;
          "derived_access_scope_id"?: string | null;
          "active"?: boolean;
          "last_invited_at"?: string | null;
          "created_by_user_id"?: string | null;
          "updated_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "source_app"?: string | null;
          "source_project_id"?: string | null;
          "source_assignment_id"?: string | null;
          "source_person_id"?: string | null;
          "source_access_scope_managed"?: boolean;
        };
        Update: {
          "id"?: string;
          "project_id"?: string;
          "user_id"?: string | null;
          "profile_name"?: string;
          "profile_email"?: string | null;
          "production_role"?: string | null;
          "production_category_id"?: string | null;
          "budget_access_role"?: string;
          "derived_access_scope_id"?: string | null;
          "active"?: boolean;
          "last_invited_at"?: string | null;
          "created_by_user_id"?: string | null;
          "updated_by_user_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "source_app"?: string | null;
          "source_project_id"?: string | null;
          "source_assignment_id"?: string | null;
          "source_person_id"?: string | null;
          "source_access_scope_managed"?: boolean;
        };
        Relationships: [
          { foreignKeyName: "production_team_assignments_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_assignments_derived_access_scope_id_fkey"; columns: ["derived_access_scope_id"]; isOneToOne: false; referencedRelation: "user_access_scopes"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_assignments_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_assignments_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_assignments_updated_by_user_id_fkey"; columns: ["updated_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_assignments_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "production_team_budget_scopes": {
        Row: {
          "id": string;
          "production_team_assignment_id": string;
          "production_category_id": string;
          "derived_access_scope_id": string | null;
          "source_access_scope_managed": boolean;
          "active": boolean;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "production_team_assignment_id"?: string;
          "production_category_id"?: string;
          "derived_access_scope_id"?: string | null;
          "source_access_scope_managed"?: boolean;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "production_team_assignment_id"?: string;
          "production_category_id"?: string;
          "derived_access_scope_id"?: string | null;
          "source_access_scope_managed"?: boolean;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "production_team_budget_scopes_derived_access_scope_id_fkey"; columns: ["derived_access_scope_id"]; isOneToOne: false; referencedRelation: "user_access_scopes"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_budget_scopes_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "production_team_budget_scopes_production_team_assignment_i_fkey"; columns: ["production_team_assignment_id"]; isOneToOne: false; referencedRelation: "production_team_assignments"; referencedColumns: ["id"] }
        ];
      };
      "programs": {
        Row: {
          "id": string;
          "code": string;
          "name": string;
          "active": boolean;
          "sort_order": number | string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "code"?: string;
          "name"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "code"?: string;
          "name"?: string;
          "active"?: boolean;
          "sort_order"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [

        ];
      };
      "project_budget_lines": {
        Row: {
          "id": string;
          "project_id": string;
          "budget_code": string;
          "category": string;
          "line_name": string;
          "allocated_amount": number | string;
          "sort_order": number | string;
          "active": boolean;
          "created_at": string;
          "account_code_id": string | null;
          "production_category_id": string | null;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string;
          "budget_code"?: string;
          "category"?: string;
          "line_name"?: string;
          "allocated_amount"?: number | string;
          "sort_order"?: number | string;
          "active"?: boolean;
          "created_at"?: string;
          "account_code_id"?: string | null;
          "production_category_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "project_id"?: string;
          "budget_code"?: string;
          "category"?: string;
          "line_name"?: string;
          "allocated_amount"?: number | string;
          "sort_order"?: number | string;
          "active"?: boolean;
          "created_at"?: string;
          "account_code_id"?: string | null;
          "production_category_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "project_budget_lines_account_code_id_fkey"; columns: ["account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "project_budget_lines_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "project_budget_lines_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      "project_memberships": {
        Row: {
          "id": string;
          "project_id": string;
          "user_id": string;
          "role": string;
          "code_scope": unknown[];
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "code_scope"?: unknown[];
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "project_id"?: string;
          "user_id"?: string;
          "role"?: string;
          "code_scope"?: unknown[];
          "created_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "project_memberships_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "project_memberships_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "projects": {
        Row: {
          "id": string;
          "name": string;
          "season": string | null;
          "status": string;
          "start_date": string | null;
          "end_date": string | null;
          "created_at": string;
          "updated_at": string;
          "organization_id": string | null;
          "sort_order": number | string;
          "planning_requests_enabled": boolean;
          "fiscal_year_id": string | null;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "season"?: string | null;
          "status"?: string;
          "start_date"?: string | null;
          "end_date"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "organization_id"?: string | null;
          "sort_order"?: number | string;
          "planning_requests_enabled"?: boolean;
          "fiscal_year_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "season"?: string | null;
          "status"?: string;
          "start_date"?: string | null;
          "end_date"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "organization_id"?: string | null;
          "sort_order"?: number | string;
          "planning_requests_enabled"?: boolean;
          "fiscal_year_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "projects_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "projects_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      "purchase_allocations": {
        Row: {
          "id": string;
          "purchase_id": string;
          "reporting_budget_line_id": string;
          "account_code_id": string | null;
          "reporting_bucket": string;
          "amount": number | string;
          "note": string | null;
          "created_at": string;
          "updated_at": string;
          "production_category_id": string | null;
        };
        Insert: {
          "id"?: string;
          "purchase_id"?: string;
          "reporting_budget_line_id"?: string;
          "account_code_id"?: string | null;
          "reporting_bucket"?: string;
          "amount"?: number | string;
          "note"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "production_category_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "purchase_id"?: string;
          "reporting_budget_line_id"?: string;
          "account_code_id"?: string | null;
          "reporting_bucket"?: string;
          "amount"?: number | string;
          "note"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "production_category_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "purchase_allocations_account_code_id_fkey"; columns: ["account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_allocations_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_allocations_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_allocations_reporting_budget_line_id_fkey"; columns: ["reporting_budget_line_id"]; isOneToOne: false; referencedRelation: "project_budget_lines"; referencedColumns: ["id"] }
        ];
      };
      "purchase_events": {
        Row: {
          "id": string;
          "purchase_id": string;
          "from_status": string | null;
          "to_status": string;
          "estimated_amount_snapshot": number | string;
          "requested_amount_snapshot": number | string;
          "encumbered_amount_snapshot": number | string;
          "pending_cc_amount_snapshot": number | string;
          "posted_amount_snapshot": number | string;
          "changed_by_user_id": string | null;
          "note": string | null;
          "changed_at": string;
        };
        Insert: {
          "id"?: string;
          "purchase_id"?: string;
          "from_status"?: string | null;
          "to_status"?: string;
          "estimated_amount_snapshot"?: number | string;
          "requested_amount_snapshot"?: number | string;
          "encumbered_amount_snapshot"?: number | string;
          "pending_cc_amount_snapshot"?: number | string;
          "posted_amount_snapshot"?: number | string;
          "changed_by_user_id"?: string | null;
          "note"?: string | null;
          "changed_at"?: string;
        };
        Update: {
          "id"?: string;
          "purchase_id"?: string;
          "from_status"?: string | null;
          "to_status"?: string;
          "estimated_amount_snapshot"?: number | string;
          "requested_amount_snapshot"?: number | string;
          "encumbered_amount_snapshot"?: number | string;
          "pending_cc_amount_snapshot"?: number | string;
          "posted_amount_snapshot"?: number | string;
          "changed_by_user_id"?: string | null;
          "note"?: string | null;
          "changed_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "purchase_events_changed_by_user_id_fkey"; columns: ["changed_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_events_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "purchase_receipts": {
        Row: {
          "id": string;
          "purchase_id": string;
          "note": string | null;
          "amount_received": number | string | null;
          "fully_received": boolean;
          "attachment_url": string | null;
          "created_by_user_id": string | null;
          "created_at": string;
          "cc_statement_month_id": string | null;
        };
        Insert: {
          "id"?: string;
          "purchase_id"?: string;
          "note"?: string | null;
          "amount_received"?: number | string | null;
          "fully_received"?: boolean;
          "attachment_url"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "cc_statement_month_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "purchase_id"?: string;
          "note"?: string | null;
          "amount_received"?: number | string | null;
          "fully_received"?: boolean;
          "attachment_url"?: string | null;
          "created_by_user_id"?: string | null;
          "created_at"?: string;
          "cc_statement_month_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "purchase_receipts_cc_statement_month_id_fkey"; columns: ["cc_statement_month_id"]; isOneToOne: false; referencedRelation: "cc_statement_months"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_receipts_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_receipts_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "purchase_receiving_docs": {
        Row: {
          "id": string;
          "purchase_id": string;
          "doc_code": string;
          "received_on": string | null;
          "note": string | null;
          "created_at": string;
          "created_by_user_id": string | null;
        };
        Insert: {
          "id"?: string;
          "purchase_id"?: string;
          "doc_code"?: string;
          "received_on"?: string | null;
          "note"?: string | null;
          "created_at"?: string;
          "created_by_user_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "purchase_id"?: string;
          "doc_code"?: string;
          "received_on"?: string | null;
          "note"?: string | null;
          "created_at"?: string;
          "created_by_user_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "purchase_receiving_docs_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_receiving_docs_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "purchases": {
        Row: {
          "id": string;
          "project_id": string | null;
          "budget_line_id": string | null;
          "vendor_id": string | null;
          "entered_by_user_id": string | null;
          "title": string;
          "reference_number": string | null;
          "notes": string | null;
          "estimated_amount": number | string;
          "requested_amount": number | string;
          "encumbered_amount": number | string;
          "pending_cc_amount": number | string;
          "posted_amount": number | string;
          "status": string;
          "purchase_date": string | null;
          "posted_date": string | null;
          "credit_card_id": string | null;
          "created_at": string;
          "updated_at": string;
          "requisition_number": string | null;
          "po_number": string | null;
          "invoice_number": string | null;
          "procurement_status": string;
          "ordered_on": string | null;
          "received_on": string | null;
          "paid_on": string | null;
          "budget_tracked": boolean;
          "request_type": string;
          "is_credit_card": boolean;
          "cc_workflow_status": string | null;
          "cc_statement_month_id": string | null;
          "production_category_id": string | null;
          "banner_account_code_id": string | null;
          "organization_id": string | null;
          "fiscal_year_id": string;
          "expense_claim_id": string | null;
          "expense_number": string | null;
          "expense_stage": string | null;
          "authorization_purchase_id": string | null;
          "authorized_amount": number | string | null;
          "overage_explanation": string | null;
        };
        Insert: {
          "id"?: string;
          "project_id"?: string | null;
          "budget_line_id"?: string | null;
          "vendor_id"?: string | null;
          "entered_by_user_id"?: string | null;
          "title"?: string;
          "reference_number"?: string | null;
          "notes"?: string | null;
          "estimated_amount"?: number | string;
          "requested_amount"?: number | string;
          "encumbered_amount"?: number | string;
          "pending_cc_amount"?: number | string;
          "posted_amount"?: number | string;
          "status"?: string;
          "purchase_date"?: string | null;
          "posted_date"?: string | null;
          "credit_card_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "requisition_number"?: string | null;
          "po_number"?: string | null;
          "invoice_number"?: string | null;
          "procurement_status"?: string;
          "ordered_on"?: string | null;
          "received_on"?: string | null;
          "paid_on"?: string | null;
          "budget_tracked"?: boolean;
          "request_type"?: string;
          "is_credit_card"?: boolean;
          "cc_workflow_status"?: string | null;
          "cc_statement_month_id"?: string | null;
          "production_category_id"?: string | null;
          "banner_account_code_id"?: string | null;
          "organization_id"?: string | null;
          "fiscal_year_id"?: string;
          "expense_claim_id"?: string | null;
          "expense_number"?: string | null;
          "expense_stage"?: string | null;
          "authorization_purchase_id"?: string | null;
          "authorized_amount"?: number | string | null;
          "overage_explanation"?: string | null;
        };
        Update: {
          "id"?: string;
          "project_id"?: string | null;
          "budget_line_id"?: string | null;
          "vendor_id"?: string | null;
          "entered_by_user_id"?: string | null;
          "title"?: string;
          "reference_number"?: string | null;
          "notes"?: string | null;
          "estimated_amount"?: number | string;
          "requested_amount"?: number | string;
          "encumbered_amount"?: number | string;
          "pending_cc_amount"?: number | string;
          "posted_amount"?: number | string;
          "status"?: string;
          "purchase_date"?: string | null;
          "posted_date"?: string | null;
          "credit_card_id"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "requisition_number"?: string | null;
          "po_number"?: string | null;
          "invoice_number"?: string | null;
          "procurement_status"?: string;
          "ordered_on"?: string | null;
          "received_on"?: string | null;
          "paid_on"?: string | null;
          "budget_tracked"?: boolean;
          "request_type"?: string;
          "is_credit_card"?: boolean;
          "cc_workflow_status"?: string | null;
          "cc_statement_month_id"?: string | null;
          "production_category_id"?: string | null;
          "banner_account_code_id"?: string | null;
          "organization_id"?: string | null;
          "fiscal_year_id"?: string;
          "expense_claim_id"?: string | null;
          "expense_number"?: string | null;
          "expense_stage"?: string | null;
          "authorization_purchase_id"?: string | null;
          "authorized_amount"?: number | string | null;
          "overage_explanation"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "purchases_authorization_purchase_id_fkey"; columns: ["authorization_purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_banner_account_code_id_fkey"; columns: ["banner_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_budget_line_id_fkey"; columns: ["budget_line_id"]; isOneToOne: false; referencedRelation: "project_budget_lines"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_cc_statement_month_id_fkey"; columns: ["cc_statement_month_id"]; isOneToOne: false; referencedRelation: "cc_statement_months"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_credit_card_id_fkey"; columns: ["credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_entered_by_user_id_fkey"; columns: ["entered_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_expense_claim_id_fkey"; columns: ["expense_claim_id"]; isOneToOne: false; referencedRelation: "expense_claims"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: false; referencedRelation: "vendors"; referencedColumns: ["id"] }
        ];
      };
      "stg_procurement_import": {
        Row: {
          "project_name": string | null;
          "season": string | null;
          "title": string | null;
          "vendor_name": string | null;
          "reference_number": string | null;
          "requisition_number": string | null;
          "po_number": string | null;
          "invoice_number": string | null;
          "budget_tracked": boolean | null;
          "budget_code": string | null;
          "line_name": string | null;
          "procurement_status": string | null;
          "budget_status": string | null;
          "estimated_amount": number | string | null;
          "requested_amount": number | string | null;
          "encumbered_amount": number | string | null;
          "pending_cc_amount": number | string | null;
          "posted_amount": number | string | null;
          "ordered_on": string | null;
          "received_on": string | null;
          "paid_on": string | null;
          "notes": string | null;
          "org": string | null;
        };
        Insert: {
          "project_name"?: string | null;
          "season"?: string | null;
          "title"?: string | null;
          "vendor_name"?: string | null;
          "reference_number"?: string | null;
          "requisition_number"?: string | null;
          "po_number"?: string | null;
          "invoice_number"?: string | null;
          "budget_tracked"?: boolean | null;
          "budget_code"?: string | null;
          "line_name"?: string | null;
          "procurement_status"?: string | null;
          "budget_status"?: string | null;
          "estimated_amount"?: number | string | null;
          "requested_amount"?: number | string | null;
          "encumbered_amount"?: number | string | null;
          "pending_cc_amount"?: number | string | null;
          "posted_amount"?: number | string | null;
          "ordered_on"?: string | null;
          "received_on"?: string | null;
          "paid_on"?: string | null;
          "notes"?: string | null;
          "org"?: string | null;
        };
        Update: {
          "project_name"?: string | null;
          "season"?: string | null;
          "title"?: string | null;
          "vendor_name"?: string | null;
          "reference_number"?: string | null;
          "requisition_number"?: string | null;
          "po_number"?: string | null;
          "invoice_number"?: string | null;
          "budget_tracked"?: boolean | null;
          "budget_code"?: string | null;
          "line_name"?: string | null;
          "procurement_status"?: string | null;
          "budget_status"?: string | null;
          "estimated_amount"?: number | string | null;
          "requested_amount"?: number | string | null;
          "encumbered_amount"?: number | string | null;
          "pending_cc_amount"?: number | string | null;
          "posted_amount"?: number | string | null;
          "ordered_on"?: string | null;
          "received_on"?: string | null;
          "paid_on"?: string | null;
          "notes"?: string | null;
          "org"?: string | null;
        };
        Relationships: [

        ];
      };
      "union_agreement_funds": {
        Row: {
          "id": string;
          "union_agreement_id": string;
          "union_fund_id": string;
          "percentage": number | string;
          "contribution_type": string;
          "sort_order": number | string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "union_agreement_id"?: string;
          "union_fund_id"?: string;
          "percentage"?: number | string;
          "contribution_type"?: string;
          "sort_order"?: number | string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "union_agreement_id"?: string;
          "union_fund_id"?: string;
          "percentage"?: number | string;
          "contribution_type"?: string;
          "sort_order"?: number | string;
          "created_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "union_agreement_funds_union_agreement_id_fkey"; columns: ["union_agreement_id"]; isOneToOne: false; referencedRelation: "union_agreements"; referencedColumns: ["id"] },
          { foreignKeyName: "union_agreement_funds_union_fund_id_fkey"; columns: ["union_fund_id"]; isOneToOne: false; referencedRelation: "union_funds"; referencedColumns: ["id"] }
        ];
      };
      "union_agreements": {
        Row: {
          "id": string;
          "name": string;
          "union_name": string;
          "version_label": string;
          "effective_from": string | null;
          "effective_to": string | null;
          "notes": string | null;
          "active": boolean;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "union_name"?: string;
          "version_label"?: string;
          "effective_from"?: string | null;
          "effective_to"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "union_name"?: string;
          "version_label"?: string;
          "effective_from"?: string | null;
          "effective_to"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [

        ];
      };
      "union_funds": {
        Row: {
          "id": string;
          "name": string;
          "vendor_number": string | null;
          "foapal_id": string | null;
          "check_request_handling": string;
          "check_request_other_location": string | null;
          "vendor_address1": string | null;
          "vendor_address2": string | null;
          "vendor_address3": string | null;
          "tax_id_encrypted": string | null;
          "tax_id_last4": string | null;
          "notes": string | null;
          "active": boolean;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "vendor_number"?: string | null;
          "foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "vendor_number"?: string | null;
          "foapal_id"?: string | null;
          "check_request_handling"?: string;
          "check_request_other_location"?: string | null;
          "vendor_address1"?: string | null;
          "vendor_address2"?: string | null;
          "vendor_address3"?: string | null;
          "tax_id_encrypted"?: string | null;
          "tax_id_last4"?: string | null;
          "notes"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "union_funds_foapal_id_fkey"; columns: ["foapal_id"]; isOneToOne: false; referencedRelation: "foapals"; referencedColumns: ["id"] }
        ];
      };
      "user_access_scopes": {
        Row: {
          "id": string;
          "user_id": string;
          "scope_role": string;
          "fiscal_year_id": string | null;
          "organization_id": string | null;
          "project_id": string | null;
          "production_category_id": string | null;
          "active": boolean;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "user_id"?: string;
          "scope_role"?: string;
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "project_id"?: string | null;
          "production_category_id"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "user_id"?: string;
          "scope_role"?: string;
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "project_id"?: string | null;
          "production_category_id"?: string | null;
          "active"?: boolean;
          "created_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "user_access_scopes_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "user_access_scopes_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "user_access_scopes_production_category_id_fkey"; columns: ["production_category_id"]; isOneToOne: false; referencedRelation: "production_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "user_access_scopes_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "user_access_scopes_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      "users": {
        Row: {
          "id": string;
          "full_name": string | null;
          "created_at": string;
          "deleted_at": string | null;
        };
        Insert: {
          "id"?: string;
          "full_name"?: string | null;
          "created_at"?: string;
          "deleted_at"?: string | null;
        };
        Update: {
          "id"?: string;
          "full_name"?: string | null;
          "created_at"?: string;
          "deleted_at"?: string | null;
        };
        Relationships: [

        ];
      };
      "v_actuals_by_banner_code": {
        Row: {
          "project_id": string | null;
          "organization_id": string | null;
          "organization_name": string | null;
          "org_code": string | null;
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "banner_account_code": string | null;
          "banner_category": string | null;
          "banner_name": string | null;
          "requested_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "posted_total": number | string | null;
          "obligated_total": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "banner_account_code"?: string | null;
          "banner_category"?: string | null;
          "banner_name"?: string | null;
          "requested_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "posted_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "banner_account_code"?: string | null;
          "banner_category"?: string | null;
          "banner_name"?: string | null;
          "requested_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "posted_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_actuals_by_category": {
        Row: {
          "project_id": string | null;
          "organization_id": string | null;
          "organization_name": string | null;
          "org_code": string | null;
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "production_category": string | null;
          "requested_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "posted_total": number | string | null;
          "obligated_total": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "production_category"?: string | null;
          "requested_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "posted_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "production_category"?: string | null;
          "requested_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "posted_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_budget_line_totals": {
        Row: {
          "project_budget_line_id": string | null;
          "project_id": string | null;
          "budget_code": string | null;
          "category": string | null;
          "line_name": string | null;
          "allocated_amount": number | string | null;
          "requested_open_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "ytd_total": number | string | null;
          "obligated_total": number | string | null;
          "remaining_true": number | string | null;
          "remaining_if_requested_approved": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "project_budget_line_id"?: string | null;
          "project_id"?: string | null;
          "budget_code"?: string | null;
          "category"?: string | null;
          "line_name"?: string | null;
          "allocated_amount"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "project_budget_line_id"?: string | null;
          "project_id"?: string | null;
          "budget_code"?: string | null;
          "category"?: string | null;
          "line_name"?: string | null;
          "allocated_amount"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_cc_pending_by_code": {
        Row: {
          "project_id": string | null;
          "budget_code": string | null;
          "credit_card_id": string | null;
          "credit_card_name": string | null;
          "pending_cc_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "budget_code"?: string | null;
          "credit_card_id"?: string | null;
          "credit_card_name"?: string | null;
          "pending_cc_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "budget_code"?: string | null;
          "credit_card_id"?: string | null;
          "credit_card_name"?: string | null;
          "pending_cc_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_cc_posted_by_month": {
        Row: {
          "project_id": string | null;
          "statement_month": string | null;
          "budget_code": string | null;
          "posted_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "statement_month"?: string | null;
          "budget_code"?: string | null;
          "posted_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "statement_month"?: string | null;
          "budget_code"?: string | null;
          "posted_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_commitment_diagnostics": {
        Row: {
          "purchase_id": string | null;
          "purchase_title": string | null;
          "request_type": string | null;
          "purchase_status": string | null;
          "procurement_status": string | null;
          "purchase_organization_id": string | null;
          "project_organization_id": string | null;
          "raw_organization_id": string | null;
          "raw_org_code": string | null;
          "raw_organization_name": string | null;
          "raw_org_fiscal_year_id": string | null;
          "normalized_organization_id": string | null;
          "fiscal_year_organization_id": string | null;
          "fiscal_year_organization_name": string | null;
          "purchase_order_date": string | null;
          "institutional_order_date": string | null;
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "purchase_allocation_id": string | null;
          "allocation_amount": number | string | null;
          "account_code_id": string | null;
          "account_code": string | null;
          "account_name": string | null;
          "budget_plan_id": string | null;
          "budget_plan_month_id": string | null;
          "month_start": string | null;
          "commitment_id": string | null;
          "commitment_status": string | null;
          "committed_amount": number | string | null;
          "contract_installment_id": string | null;
          "installment_number": number | string | null;
          "contract_due_date": string | null;
          "ap_receive_by": string | null;
          "mail_by": string | null;
          "diagnostic_status": string | null;
          "used_legacy_or_cross_year_org": boolean | null;
        };
        Insert: {
          "purchase_id"?: string | null;
          "purchase_title"?: string | null;
          "request_type"?: string | null;
          "purchase_status"?: string | null;
          "procurement_status"?: string | null;
          "purchase_organization_id"?: string | null;
          "project_organization_id"?: string | null;
          "raw_organization_id"?: string | null;
          "raw_org_code"?: string | null;
          "raw_organization_name"?: string | null;
          "raw_org_fiscal_year_id"?: string | null;
          "normalized_organization_id"?: string | null;
          "fiscal_year_organization_id"?: string | null;
          "fiscal_year_organization_name"?: string | null;
          "purchase_order_date"?: string | null;
          "institutional_order_date"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "purchase_allocation_id"?: string | null;
          "allocation_amount"?: number | string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_name"?: string | null;
          "budget_plan_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "commitment_id"?: string | null;
          "commitment_status"?: string | null;
          "committed_amount"?: number | string | null;
          "contract_installment_id"?: string | null;
          "installment_number"?: number | string | null;
          "contract_due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "diagnostic_status"?: string | null;
          "used_legacy_or_cross_year_org"?: boolean | null;
        };
        Update: {
          "purchase_id"?: string | null;
          "purchase_title"?: string | null;
          "request_type"?: string | null;
          "purchase_status"?: string | null;
          "procurement_status"?: string | null;
          "purchase_organization_id"?: string | null;
          "project_organization_id"?: string | null;
          "raw_organization_id"?: string | null;
          "raw_org_code"?: string | null;
          "raw_organization_name"?: string | null;
          "raw_org_fiscal_year_id"?: string | null;
          "normalized_organization_id"?: string | null;
          "fiscal_year_organization_id"?: string | null;
          "fiscal_year_organization_name"?: string | null;
          "purchase_order_date"?: string | null;
          "institutional_order_date"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "purchase_allocation_id"?: string | null;
          "allocation_amount"?: number | string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_name"?: string | null;
          "budget_plan_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "commitment_id"?: string | null;
          "commitment_status"?: string | null;
          "committed_amount"?: number | string | null;
          "contract_installment_id"?: string | null;
          "installment_number"?: number | string | null;
          "contract_due_date"?: string | null;
          "ap_receive_by"?: string | null;
          "mail_by"?: string | null;
          "diagnostic_status"?: string | null;
          "used_legacy_or_cross_year_org"?: boolean | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_monthly_budget_availability": {
        Row: {
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "organization_id": string | null;
          "org_code": string | null;
          "organization_name": string | null;
          "account_code_id": string | null;
          "account_code": string | null;
          "account_category": string | null;
          "account_name": string | null;
          "budget_plan_month_id": string | null;
          "month_start": string | null;
          "fiscal_month_index": number | string | null;
          "monthly_allocation": number | string | null;
          "commitment_count": number | string | null;
          "submitted_commitments_amount": number | string | null;
          "approved_incoming_variance_amount": number | string | null;
          "approved_outgoing_variance_amount": number | string | null;
          "projected_incoming_variance_amount": number | string | null;
          "projected_outgoing_variance_amount": number | string | null;
          "official_available_amount": number | string | null;
          "projected_available_amount": number | string | null;
          "is_revenue": boolean | null;
        };
        Insert: {
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "organization_id"?: string | null;
          "org_code"?: string | null;
          "organization_name"?: string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_category"?: string | null;
          "account_name"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "fiscal_month_index"?: number | string | null;
          "monthly_allocation"?: number | string | null;
          "commitment_count"?: number | string | null;
          "submitted_commitments_amount"?: number | string | null;
          "approved_incoming_variance_amount"?: number | string | null;
          "approved_outgoing_variance_amount"?: number | string | null;
          "projected_incoming_variance_amount"?: number | string | null;
          "projected_outgoing_variance_amount"?: number | string | null;
          "official_available_amount"?: number | string | null;
          "projected_available_amount"?: number | string | null;
          "is_revenue"?: boolean | null;
        };
        Update: {
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "organization_id"?: string | null;
          "org_code"?: string | null;
          "organization_name"?: string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_category"?: string | null;
          "account_name"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "fiscal_month_index"?: number | string | null;
          "monthly_allocation"?: number | string | null;
          "commitment_count"?: number | string | null;
          "submitted_commitments_amount"?: number | string | null;
          "approved_incoming_variance_amount"?: number | string | null;
          "approved_outgoing_variance_amount"?: number | string | null;
          "projected_incoming_variance_amount"?: number | string | null;
          "projected_outgoing_variance_amount"?: number | string | null;
          "official_available_amount"?: number | string | null;
          "projected_available_amount"?: number | string | null;
          "is_revenue"?: boolean | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_monthly_commitment_totals": {
        Row: {
          "fiscal_year_id": string | null;
          "organization_id": string | null;
          "account_code_id": string | null;
          "budget_plan_month_id": string | null;
          "month_start": string | null;
          "commitment_count": number | string | null;
          "submitted_commitments_amount": number | string | null;
        };
        Insert: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "commitment_count"?: number | string | null;
          "submitted_commitments_amount"?: number | string | null;
        };
        Update: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "month_start"?: string | null;
          "commitment_count"?: number | string | null;
          "submitted_commitments_amount"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_monthly_commitments": {
        Row: {
          "fiscal_year_id": string | null;
          "organization_id": string | null;
          "account_code_id": string | null;
          "budget_plan_month_id": string | null;
          "order_date": string | null;
          "month_start": string | null;
          "commitment_count": number | string | null;
          "committed_amount": number | string | null;
        };
        Insert: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "order_date"?: string | null;
          "month_start"?: string | null;
          "commitment_count"?: number | string | null;
          "committed_amount"?: number | string | null;
        };
        Update: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "budget_plan_month_id"?: string | null;
          "order_date"?: string | null;
          "month_start"?: string | null;
          "commitment_count"?: number | string | null;
          "committed_amount"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_revenue_performance": {
        Row: {
          "budget_plan_id": string | null;
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "organization_id": string | null;
          "org_code": string | null;
          "organization_name": string | null;
          "account_code_id": string | null;
          "account_code": string | null;
          "account_category": string | null;
          "account_name": string | null;
          "target_amount": number | string | null;
          "received_amount": number | string | null;
          "remaining_to_target": number | string | null;
          "over_target_amount": number | string | null;
        };
        Insert: {
          "budget_plan_id"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "organization_id"?: string | null;
          "org_code"?: string | null;
          "organization_name"?: string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_category"?: string | null;
          "account_name"?: string | null;
          "target_amount"?: number | string | null;
          "received_amount"?: number | string | null;
          "remaining_to_target"?: number | string | null;
          "over_target_amount"?: number | string | null;
        };
        Update: {
          "budget_plan_id"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "organization_id"?: string | null;
          "org_code"?: string | null;
          "organization_name"?: string | null;
          "account_code_id"?: string | null;
          "account_code"?: string | null;
          "account_category"?: string | null;
          "account_name"?: string | null;
          "target_amount"?: number | string | null;
          "received_amount"?: number | string | null;
          "remaining_to_target"?: number | string | null;
          "over_target_amount"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_institutional_variance_totals": {
        Row: {
          "budget_plan_month_id": string | null;
          "approved_incoming_amount": number | string | null;
          "approved_outgoing_amount": number | string | null;
          "projected_incoming_amount": number | string | null;
          "projected_outgoing_amount": number | string | null;
        };
        Insert: {
          "budget_plan_month_id"?: string | null;
          "approved_incoming_amount"?: number | string | null;
          "approved_outgoing_amount"?: number | string | null;
          "projected_incoming_amount"?: number | string | null;
          "projected_outgoing_amount"?: number | string | null;
        };
        Update: {
          "budget_plan_month_id"?: string | null;
          "approved_incoming_amount"?: number | string | null;
          "approved_outgoing_amount"?: number | string | null;
          "projected_incoming_amount"?: number | string | null;
          "projected_outgoing_amount"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_monthly_actuals_by_org_account": {
        Row: {
          "fiscal_year_id": string | null;
          "organization_id": string | null;
          "account_code_id": string | null;
          "month_start": string | null;
          "obligated_amount": number | string | null;
        };
        Insert: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "month_start"?: string | null;
          "obligated_amount"?: number | string | null;
        };
        Update: {
          "fiscal_year_id"?: string | null;
          "organization_id"?: string | null;
          "account_code_id"?: string | null;
          "month_start"?: string | null;
          "obligated_amount"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_organization_totals": {
        Row: {
          "organization_id": string | null;
          "organization_name": string | null;
          "org_code": string | null;
          "fiscal_year_id": string | null;
          "fiscal_year_name": string | null;
          "allocated_total": number | string | null;
          "requested_open_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "ytd_total": number | string | null;
          "obligated_total": number | string | null;
          "remaining_true": number | string | null;
          "remaining_if_requested_approved": number | string | null;
          "starting_budget_total": number | string | null;
          "additional_income_total": number | string | null;
          "funding_pool_total": number | string | null;
          "funding_pool_available": number | string | null;
          "income_total": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "starting_budget_total"?: number | string | null;
          "additional_income_total"?: number | string | null;
          "funding_pool_total"?: number | string | null;
          "funding_pool_available"?: number | string | null;
          "income_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "organization_id"?: string | null;
          "organization_name"?: string | null;
          "org_code"?: string | null;
          "fiscal_year_id"?: string | null;
          "fiscal_year_name"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "starting_budget_total"?: number | string | null;
          "additional_income_total"?: number | string | null;
          "funding_pool_total"?: number | string | null;
          "funding_pool_available"?: number | string | null;
          "income_total"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_portfolio_summary": {
        Row: {
          "project_id": string | null;
          "project_name": string | null;
          "season": string | null;
          "allocated_total": number | string | null;
          "obligated_total": number | string | null;
          "remaining_true": number | string | null;
          "remaining_if_requested_approved": number | string | null;
          "income_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "project_name"?: string | null;
          "season"?: string | null;
          "allocated_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "income_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "project_name"?: string | null;
          "season"?: string | null;
          "allocated_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "income_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_project_category_totals": {
        Row: {
          "project_id": string | null;
          "category": string | null;
          "allocated_total": number | string | null;
          "requested_open_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "ytd_total": number | string | null;
          "obligated_total": number | string | null;
          "remaining_true": number | string | null;
          "remaining_if_requested_approved": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "category"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "category"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "v_project_totals": {
        Row: {
          "project_id": string | null;
          "allocated_total": number | string | null;
          "requested_open_total": number | string | null;
          "enc_total": number | string | null;
          "pending_cc_total": number | string | null;
          "ytd_total": number | string | null;
          "obligated_total": number | string | null;
          "remaining_true": number | string | null;
          "remaining_if_requested_approved": number | string | null;
          "held_total": number | string | null;
        };
        Insert: {
          "project_id"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Update: {
          "project_id"?: string | null;
          "allocated_total"?: number | string | null;
          "requested_open_total"?: number | string | null;
          "enc_total"?: number | string | null;
          "pending_cc_total"?: number | string | null;
          "ytd_total"?: number | string | null;
          "obligated_total"?: number | string | null;
          "remaining_true"?: number | string | null;
          "remaining_if_requested_approved"?: number | string | null;
          "held_total"?: number | string | null;
        };
        Relationships: [

        ];
      };
      "variance_events": {
        Row: {
          "id": string;
          "variance_request_id": string;
          "from_status": string | null;
          "to_status": string;
          "changed_by_user_id": string | null;
          "note": string | null;
          "changed_at": string;
        };
        Insert: {
          "id"?: string;
          "variance_request_id"?: string;
          "from_status"?: string | null;
          "to_status"?: string;
          "changed_by_user_id"?: string | null;
          "note"?: string | null;
          "changed_at"?: string;
        };
        Update: {
          "id"?: string;
          "variance_request_id"?: string;
          "from_status"?: string | null;
          "to_status"?: string;
          "changed_by_user_id"?: string | null;
          "note"?: string | null;
          "changed_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "variance_events_changed_by_user_id_fkey"; columns: ["changed_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_events_variance_request_id_fkey"; columns: ["variance_request_id"]; isOneToOne: false; referencedRelation: "variance_requests"; referencedColumns: ["id"] }
        ];
      };
      "variance_request_lines": {
        Row: {
          "id": string;
          "variance_request_id": string;
          "from_budget_plan_month_id": string;
          "to_budget_plan_month_id": string;
          "from_organization_id": string;
          "from_account_code_id": string;
          "from_month_start": string;
          "to_organization_id": string;
          "to_account_code_id": string;
          "to_month_start": string;
          "transfer_amount": number | string;
          "narrative": string | null;
          "cross_org_override": boolean;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "variance_request_id"?: string;
          "from_budget_plan_month_id"?: string;
          "to_budget_plan_month_id"?: string;
          "from_organization_id"?: string;
          "from_account_code_id"?: string;
          "from_month_start"?: string;
          "to_organization_id"?: string;
          "to_account_code_id"?: string;
          "to_month_start"?: string;
          "transfer_amount"?: number | string;
          "narrative"?: string | null;
          "cross_org_override"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "variance_request_id"?: string;
          "from_budget_plan_month_id"?: string;
          "to_budget_plan_month_id"?: string;
          "from_organization_id"?: string;
          "from_account_code_id"?: string;
          "from_month_start"?: string;
          "to_organization_id"?: string;
          "to_account_code_id"?: string;
          "to_month_start"?: string;
          "transfer_amount"?: number | string;
          "narrative"?: string | null;
          "cross_org_override"?: boolean;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "variance_request_lines_from_account_code_id_fkey"; columns: ["from_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_from_budget_plan_month_id_fkey"; columns: ["from_budget_plan_month_id"]; isOneToOne: false; referencedRelation: "budget_plan_months"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_from_organization_id_fkey"; columns: ["from_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_to_account_code_id_fkey"; columns: ["to_account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_to_budget_plan_month_id_fkey"; columns: ["to_budget_plan_month_id"]; isOneToOne: false; referencedRelation: "budget_plan_months"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_to_organization_id_fkey"; columns: ["to_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_lines_variance_request_id_fkey"; columns: ["variance_request_id"]; isOneToOne: false; referencedRelation: "variance_requests"; referencedColumns: ["id"] }
        ];
      };
      "variance_request_targets": {
        Row: {
          "id": string;
          "variance_request_id": string;
          "budget_plan_month_id": string;
          "organization_id": string;
          "account_code_id": string;
          "month_start": string;
          "shortage_amount": number | string;
          "created_at": string;
          "updated_at": string;
        };
        Insert: {
          "id"?: string;
          "variance_request_id"?: string;
          "budget_plan_month_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "month_start"?: string;
          "shortage_amount"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Update: {
          "id"?: string;
          "variance_request_id"?: string;
          "budget_plan_month_id"?: string;
          "organization_id"?: string;
          "account_code_id"?: string;
          "month_start"?: string;
          "shortage_amount"?: number | string;
          "created_at"?: string;
          "updated_at"?: string;
        };
        Relationships: [
          { foreignKeyName: "variance_request_targets_account_code_id_fkey"; columns: ["account_code_id"]; isOneToOne: false; referencedRelation: "account_codes"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_targets_budget_plan_month_id_fkey"; columns: ["budget_plan_month_id"]; isOneToOne: false; referencedRelation: "budget_plan_months"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_targets_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_request_targets_variance_request_id_fkey"; columns: ["variance_request_id"]; isOneToOne: false; referencedRelation: "variance_requests"; referencedColumns: ["id"] }
        ];
      };
      "variance_requests": {
        Row: {
          "id": string;
          "fiscal_year_id": string;
          "triggering_purchase_id": string | null;
          "status": string;
          "reason": string | null;
          "total_transfer_amount": number | string;
          "generated_file_path": string | null;
          "generated_file_url": string | null;
          "created_by_user_id": string | null;
          "submitted_at": string | null;
          "approved_at": string | null;
          "posted_at": string | null;
          "denied_at": string | null;
          "created_at": string;
          "updated_at": string;
          "target_budget_plan_month_id": string | null;
        };
        Insert: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "triggering_purchase_id"?: string | null;
          "status"?: string;
          "reason"?: string | null;
          "total_transfer_amount"?: number | string;
          "generated_file_path"?: string | null;
          "generated_file_url"?: string | null;
          "created_by_user_id"?: string | null;
          "submitted_at"?: string | null;
          "approved_at"?: string | null;
          "posted_at"?: string | null;
          "denied_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "target_budget_plan_month_id"?: string | null;
        };
        Update: {
          "id"?: string;
          "fiscal_year_id"?: string;
          "triggering_purchase_id"?: string | null;
          "status"?: string;
          "reason"?: string | null;
          "total_transfer_amount"?: number | string;
          "generated_file_path"?: string | null;
          "generated_file_url"?: string | null;
          "created_by_user_id"?: string | null;
          "submitted_at"?: string | null;
          "approved_at"?: string | null;
          "posted_at"?: string | null;
          "denied_at"?: string | null;
          "created_at"?: string;
          "updated_at"?: string;
          "target_budget_plan_month_id"?: string | null;
        };
        Relationships: [
          { foreignKeyName: "variance_requests_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_requests_fiscal_year_id_fkey"; columns: ["fiscal_year_id"]; isOneToOne: false; referencedRelation: "fiscal_years"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_requests_target_budget_plan_month_id_fkey"; columns: ["target_budget_plan_month_id"]; isOneToOne: false; referencedRelation: "budget_plan_months"; referencedColumns: ["id"] },
          { foreignKeyName: "variance_requests_triggering_purchase_id_fkey"; columns: ["triggering_purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] }
        ];
      };
      "vendors": {
        Row: {
          "id": string;
          "name": string;
          "created_at": string;
        };
        Insert: {
          "id"?: string;
          "name"?: string;
          "created_at"?: string;
        };
        Update: {
          "id"?: string;
          "name"?: string;
          "created_at"?: string;
        };
        Relationships: [

        ];
      };
    } & Record<string, GenericTableDefinition>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
