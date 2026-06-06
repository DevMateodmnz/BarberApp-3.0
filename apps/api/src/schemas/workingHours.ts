/**
 * Zod schemas for working hours requests
 */
import { z } from 'zod';

/**
 * A single day's working hours entry.
 * - dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
 * - openTime/closeTime: "HH:mm" 24h format, required when isActive is not explicitly false
 * - isActive: false = closed day (openTime/closeTime not required)
 */
export const WorkingHoursDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  closeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  isActive: z.boolean().optional(),
});

/**
 * Full PUT request body for updating working hours.
 * Must contain at least one day, and no duplicate dayOfWeek values.
 */
export const UpdateWorkingHoursSchema = z.object({
  workingHours: z
    .array(WorkingHoursDaySchema)
    .min(1, 'At least one day must be provided')
    .refine(
      (days) => {
        const daySet = new Set(days.map((d) => d.dayOfWeek));
        return daySet.size === days.length;
      },
      { message: 'Duplicate dayOfWeek values are not allowed' }
    ),
});

export type WorkingHoursDayInput = z.infer<typeof WorkingHoursDaySchema>;
export type UpdateWorkingHoursInput = z.infer<typeof UpdateWorkingHoursSchema>;
