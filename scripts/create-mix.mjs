#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  freshRecipe,
  recipeSchema,
  encodeRecipe,
  variantFor,
} from "../lib/recipe.ts";
// Input is intentionally explicit: meals from MCP are supplied by the invoking agent.
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const origin = new URL(
    process.argv[2] ||
      "https://mcbeat-meal-mixes.woodsy-lime-5011.chatgpt.site",
  );
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw Error("Invalid site origin");
  const recipe = freshRecipe();
  if (input.title) recipe.title = input.title;
  if (input.mode) recipe.mode = input.mode;
  if (input.bpm !== undefined) recipe.bpm = input.bpm;
  if (input.foods) {
    if (input.foods.length !== 4)
      throw Error("Provide exactly four food tracks");
    recipe.foods = input.foods.map((f) => ({
      ...f,
      variant: f.variant ?? variantFor(f.code || f.name),
    }));
  }
  if (input.muted) recipe.muted = input.muted;
  recipeSchema.parse(recipe);
  console.log(
    JSON.stringify(
      {
        title: recipe.title,
        url: `${origin.origin}/#mix=${encodeRecipe(recipe)}`,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Unable to create score");
  process.exitCode = 1;
}
