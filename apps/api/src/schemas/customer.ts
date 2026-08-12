import { z } from 'zod';

export const CustomerSortSchema = z.enum(['recent', 'name', 'no_shows']);

export const ListCustomersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: CustomerSortSchema.default('recent'),
  })
  .strict();

export const SearchCustomersBodySchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: CustomerSortSchema.default('recent'),
  })
  .strict();

export const UpdateCustomerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    internalNotes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined
      || value.email !== undefined
      || value.internalNotes !== undefined,
    {
      message: 'At least one field must be provided',
      path: [],
    }
  );

export type CustomerSort = z.infer<typeof CustomerSortSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
export type SearchCustomersBody = z.infer<typeof SearchCustomersBodySchema>;
export type UpdateCustomerBody = z.infer<typeof UpdateCustomerBodySchema>;
