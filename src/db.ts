
import "dotenv/config";
import { Pool } from "pg";
import { buildPgPoolConfig } from "./infrastructure/database/pg-config.js";

export const pool = new Pool(buildPgPoolConfig());
