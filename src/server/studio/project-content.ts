import { z } from 'zod';

export const projectStages = ['planned', 'in_progress', 'on_hold', 'completed'] as const;
export const projectDetails = z.object({
  title: z.string().trim().min(3).max(180),
  scope: z.string().trim().min(10).max(4000),
  next_step: z.string().trim().max(500),
  status: z.enum(projectStages),
  assigned_to: z.uuid().nullable(),
  due_on: z.iso.date().nullable(),
}).strict();

export type ProjectDetails = z.infer<typeof projectDetails>;
export type Project = ProjectDetails & {
  id: string;
  prospect_id: string;
  client_name: string;
  revision: number;
  approved_by: string;
  created_at: string;
  updated_at: string;
};
