"use client";

import { useState } from "react";
import {
  addBudgetLineAction,
  createAccountCodeAction,
  createFiscalYearAction,
  createOrganizationAction,
  createProductionCategoryAction,
  createProjectAction
} from "@/app/settings/actions";
import type {
  FiscalYearOption,
  OrganizationOption,
  ProductionCategoryOption,
  SettingsProject
} from "@/lib/db";

type Props = {
  fiscalYears: FiscalYearOption[];
  organizations: OrganizationOption[];
  templates: string[];
  projects: SettingsProject[];
  productionCategories: ProductionCategoryOption[];
};

type EntityType = "fiscal_year" | "organization" | "project" | "production_category" | "account_code" | "budget_line";

export function AddEntityPanel({ fiscalYears, organizations, templates, projects, productionCategories }: Props) {
  const [entityType, setEntityType] = useState<EntityType>("project");

  return (
    <article className="panel panelFull">
      <h2>Add</h2>
      <p>Use one flow to add fiscal years, organizations, projects, account codes, or budget lines.</p>

      <label className="singlePicker">
        Add Type
        <select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType)}>
          <option value="fiscal_year">Fiscal Year</option>
          <option value="organization">Organization</option>
          <option value="project">Project</option>
          <option value="production_category">Production Category</option>
          <option value="account_code">Account Code</option>
          <option value="budget_line">Budget Line</option>
        </select>
      </label>

      {entityType === "fiscal_year" ? (
        <form className="requestForm" action={createFiscalYearAction}>
          <label>
            Name
            <input name="name" required placeholder="Ex: FY 2025-2026" />
          </label>
          <label>
            Start Date
            <input type="date" name="startDate" />
          </label>
          <label>
            End Date
            <input type="date" name="endDate" />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Fiscal Year
          </button>
        </form>
      ) : null}

      {entityType === "organization" ? (
        <form className="requestForm" action={createOrganizationAction}>
          <label>
            Name
            <input name="name" required placeholder="Ex: Theatre Department" />
          </label>
          <label>
            Org Code
            <input name="orgCode" required placeholder="Ex: ORG-THR" />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Organization
          </button>
        </form>
      ) : null}

      {entityType === "project" ? (
        <form className="requestForm" action={createProjectAction}>
          <label>
            Project Name
            <input name="projectName" required placeholder="Ex: Spring Musical 2026" />
          </label>
          <label>
            Season
            <input name="season" placeholder="Ex: Spring 2026" />
          </label>
          <label>
            Fiscal Year
            <select name="fiscalYearId">
              <option value="">No fiscal year</option>
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Organization
            <select name="organizationId">
              <option value="">No organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select name="templateName" defaultValue="Play/Musical Default">
              {templates.map((templateName) => (
                <option key={templateName} value={templateName}>
                  {templateName}
                </option>
              ))}
            </select>
          </label>
          <label className="checkboxLabel">
            <input name="useTemplate" type="checkbox" defaultChecked />
            Apply selected template lines
          </label>
          <label className="checkboxLabel">
            <input name="planningRequestsEnabled" type="checkbox" defaultChecked />
            Enable Planning Requests for this project
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Project
          </button>
        </form>
      ) : null}

      {entityType === "account_code" ? (
        <form className="requestForm" action={createAccountCodeAction}>
          <label>
            Code
            <input name="code" required placeholder="Ex: 11310" />
          </label>
          <label>
            Category
            <input name="category" required placeholder="Ex: Scenic" />
          </label>
          <label>
            Name
            <input name="name" required placeholder="Ex: Scenic Supplies" />
          </label>
          <label className="checkboxLabel">
            <input name="active" type="checkbox" defaultChecked />
            Active
          </label>
          <label className="checkboxLabel">
            <input name="isRevenue" type="checkbox" />
            Revenue Account
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Save Account Code
          </button>
        </form>
      ) : null}

      {entityType === "production_category" ? (
        <form className="requestForm" action={createProductionCategoryAction}>
          <label>
            Category Name
            <input name="name" required placeholder="Ex: Marketing" />
          </label>
          <label>
            Sort Order
            <input name="sortOrder" type="number" step="1" placeholder="Optional" />
          </label>
          <label className="checkboxLabel">
            <input name="active" type="checkbox" defaultChecked />
            Active
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Save Category
          </button>
        </form>
      ) : null}

      {entityType === "budget_line" ? (
        <form className="requestForm" action={addBudgetLineAction}>
          <label>
            Project
            <select name="projectId" required>
              <option value="">Select project</option>
              {projects
                .filter((project) => project.name.trim().toLowerCase() !== "external procurement")
                .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} {project.season ? `(${project.season})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select name="productionCategoryId" required>
              <option value="">Select department</option>
              {productionCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Allocated Amount
            <input name="allocatedAmount" type="number" step="0.01" min="0" defaultValue="0" />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Budget Line
          </button>
        </form>
      ) : null}
    </article>
  );
}
