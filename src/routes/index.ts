import { toNodeHandler } from "better-auth/node"
import express from "express"
import { auth } from "../lib/auth"
import { Environment } from "../utils/environment"
import swaggerSpec from "src/lib/docs/swagger.docs"
import {apiReference} from "@scalar/express-api-reference";
const api = express.Router()

api.all("/auth/{*any}", toNodeHandler(auth))


api.get("/openapi.json", (req, res)=>{
  res.json(swaggerSpec)
})

api.get("/docs", apiReference({url: "/api/openapi.json"}))

/* your routes here */


/* ---------- */

api.get("/health", async (req , res) => {
  if(Environment.is_in_development){
    return res.json(
      {
        Environment
      }
    )
  }
  return res.json({
    message: "Backend kit is live."
  })
})


export default api