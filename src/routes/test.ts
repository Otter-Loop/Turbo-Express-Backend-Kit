import z from "zod";
import { createZodRouter } from "../lib/turbo-express/router/core";
const testRouter = createZodRouter();

testRouter
  .schema(
    z.object({
      query: z.object({
        name: z.string().optional(),
        age: z.coerce.number().optional(),
      }),
    }),
  )
  .get("", async (req, res) => {
    const { name, age } = req.validated.query;
    return res.json({
      message: `Hello, ${name || "world"}! You are ${age || "unknown"} years old.`,
    });
  })
  .schema(
    z.object({
      query: z.object({
        name: z.string().optional(),
        age: z.coerce.number().optional(),
        address: z.string().optional(),
      }),
    }),
  )
  .get("/address", async (req, res) => {
    const { name, age, address } = req.validated.query;
    return res.json({
      message: `Hello, ${name || "world"}! You are ${age || "unknown"} years old. Your address is ${address || "unknown"}.`,
    });
  });

export default testRouter;
