import { z } from 'zod';

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export const EmployeeWeeklyIntervalSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  start: z.string().regex(TIME_PATTERN),
  end: z.string().regex(TIME_PATTERN),
});

export const UpdateEmployeeScheduleSchema = z.object({
  mode: z.enum(['INHERIT_BARBERSHOP', 'CUSTOM']),
  weeklyIntervals: z
    .array(EmployeeWeeklyIntervalSchema)
    .default([])
    .refine(
      (intervals) => new Set(intervals.map((interval) => interval.dayOfWeek)).size === intervals.length,
      { message: 'Duplicate dayOfWeek values are not allowed' },
    ),
  expectedUpdatedAt: z.string().datetime().optional(),
});

const EmployeeExceptionIntervalSchema = z.object({
  start: z.string().regex(TIME_PATTERN),
  end: z.string().regex(TIME_PATTERN),
});

export const UpsertEmployeeScheduleExceptionSchema = z
  .object({
    type: z.enum(['FULL_DAY_OFF', 'CUSTOM_HOURS']),
    reason: z.string().trim().max(500).optional(),
    intervals: z.array(EmployeeExceptionIntervalSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'FULL_DAY_OFF' && value.intervals && value.intervals.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intervals'],
        message: 'FULL_DAY_OFF must not include intervals',
      });
    }

    if (value.type === 'CUSTOM_HOURS' && (!value.intervals || value.intervals.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intervals'],
        message: 'CUSTOM_HOURS requires at least one interval',
      });
    }
  });

export type UpdateEmployeeScheduleInput = z.infer<typeof UpdateEmployeeScheduleSchema>;
export type UpsertEmployeeScheduleExceptionInput = z.infer<
  typeof UpsertEmployeeScheduleExceptionSchema
>;
