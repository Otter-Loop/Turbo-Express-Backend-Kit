import { z } from "zod";

export const paramsWithIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
