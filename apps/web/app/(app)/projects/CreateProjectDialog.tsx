"use client";

import type { CreateProjectRequest, Project } from "@fleetip/contracts/project";
import { Button, Dialog, FormBanner, FormSection, Input, useToast } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useForm } from "../../../lib/form";

export interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: (project: Project) => void;
}

type Values = Record<"projectName" | "projectType" | "siteLocation" | "state" | "district" | "startDate" | "endDate", string>;

const EMPTY: Values = {
  projectName: "",
  projectType: "",
  siteLocation: "",
  state: "",
  district: "",
  startDate: "",
  endDate: "",
};

/**
 * Mirrors createProjectRequestSchema: type, name and site are required;
 * state/district optional; start date required with no "not in the past"
 * rule (a project already underway is normal); end date optional and not
 * before the start date.
 */
const createProjectSchema = z
  .object({
    projectName: z
      .string()
      .trim()
      .min(1, "Enter the project's name, e.g. Metro Line 3 — Package 4.")
      .refine(
        (value) => value.length <= 200,
        (value) => ({ message: `Project names are up to 200 characters. This one has ${value.length}.` }),
      ),
    projectType: z
      .string()
      .trim()
      .min(1, "Enter the kind of project, e.g. Urban infrastructure or Building.")
      .max(100, "Project types are up to 100 characters."),
    siteLocation: z
      .string()
      .trim()
      .min(1, "Enter where the site is. Rental companies see it on your requirements.")
      .max(200, "Site locations are up to 200 characters."),
    state: z.string().trim().max(100, "States are up to 100 characters."),
    district: z.string().trim().max(100, "Districts are up to 100 characters."),
    startDate: z.string().min(1, "Pick the day work starts. A date in the past is fine for a project already underway."),
    endDate: z.string(),
  })
  .refine((values) => !values.endDate || !values.startDate || values.endDate >= values.startDate, {
    message: "The end date can't be before the start date.",
    path: ["endDate"],
  })
  .transform(
    (values): CreateProjectRequest => ({
      projectName: values.projectName,
      projectType: values.projectType,
      siteLocation: values.siteLocation,
      state: values.state || undefined,
      district: values.district || undefined,
      startDate: values.startDate,
      endDate: values.endDate || undefined,
    }),
  );

export function CreateProjectDialog({ open, onClose, organizationId, onCreated }: CreateProjectDialogProps) {
  const toast = useToast();
  const router = useRouter();
  const form = useForm({ schema: createProjectSchema, initial: EMPTY, failTitle: "The project wasn't created" });
  const { busy, online, reset } = form;

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const handleSubmit = form.submit(async (input) => {
    const project = (await apiClient.createProject(organizationId, input)) as Project;
    toast.success({
      title: `Project ${project.projectCode} created`,
      body: `${project.projectName} at ${project.siteLocation}. You can post requirements against it now.`,
      action: {
        label: "Post requirement",
        onClick: () => router.push(`/requirements?projectId=${project.id}&post=1`),
      },
    });
    onCreated(project);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="A project groups the requirements, quotations and rentals for one site. Its name and site are copied onto every requirement you post against it."
      icon="project"
      tone="info"
      size="md"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel="Creating…" disabled={!online} title={online ? undefined : OFFLINE_HINT}>
            Create project
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <FormSection title="What it is">
        <div data-field="projectName">
          <Input label="Project name" required maxLength={220} {...form.field("projectName")} />
        </div>
        <div data-field="projectType">
          <Input label="Project type" required maxLength={120} placeholder="e.g. Urban infrastructure" {...form.field("projectType")} />
        </div>
      </FormSection>
      <FormSection title="Where it is" className="border-t border-border pt-4">
        <div data-field="siteLocation">
          <Input
            label="Site location"
            required
            maxLength={220}
            placeholder="e.g. Kharadi, Pune"
            {...form.field("siteLocation")}
            hint="Shown to rental companies on every requirement for this project."
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="district">
            <Input label="District" maxLength={120} {...form.field("district")} />
          </div>
          <div data-field="state">
            <Input label="State" maxLength={120} {...form.field("state")} />
          </div>
        </div>
      </FormSection>
      <FormSection title="When" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="startDate">
            <Input label="Start date" required type="date" mono {...form.field("startDate")} hint="Past dates are fine for a project already underway." />
          </div>
          <div data-field="endDate">
            <Input
              label="Expected end date"
              type="date"
              mono
              min={form.values.startDate || undefined}
              {...form.field("endDate")}
              hint="Leave empty if it isn't known yet."
            />
          </div>
        </div>
      </FormSection>
    </Dialog>
  );
}
