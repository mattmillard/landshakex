import { z } from "zod";

export const pointQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90)
});

export const bboxQuerySchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  limit: z.coerce.number().int().min(1).max(20000).default(5000)
});
