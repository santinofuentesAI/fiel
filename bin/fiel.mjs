#!/usr/bin/env node
import { main } from "../src/cli/main.mjs";

if (process.env.HELD_NO_DEPRECATION !== "1") {
  console.error("held: el binario `fiel` es legado; usa `held` y corre `held install` para actualizar hooks.");
}
await main(process.argv.slice(2));