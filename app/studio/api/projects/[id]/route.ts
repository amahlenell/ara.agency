import { z } from 'zod';
import { apiSession } from '@/src/server/studio/context';
import { jsonBody, apiError } from '@/src/server/studio/http';
import { projectDetails } from '@/src/server/studio/project-content';
import { projectCommand } from '@/src/server/studio/projects';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await apiSession();
    const id = z.uuid().parse((await params).id);
    const input = z.object({
      details: projectDetails, confirmed: z.literal(true), version: z.iso.datetime({ offset: true }),
    }).strict().parse(await jsonBody(request));
    const project = await projectCommand(session, id, input.details, { action: 'convert', version: input.version });
    return Response.json({ project }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await apiSession();
    const id = z.uuid().parse((await params).id);
    const input = z.object({ details: projectDetails, revision: z.number().int().positive() })
      .strict().parse(await jsonBody(request));
    const project = await projectCommand(session, id, input.details, { action: 'update', revision: input.revision });
    return Response.json({ project }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
