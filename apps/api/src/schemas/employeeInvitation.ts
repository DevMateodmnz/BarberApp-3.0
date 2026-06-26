import { z } from 'zod';

export const CreateEmployeeInvitationSchema = z
  .object({
    email: z.string().trim().min(1).email(),
  })
  .strict();

export type CreateEmployeeInvitationInput = z.infer<
  typeof CreateEmployeeInvitationSchema
>;
