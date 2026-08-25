import { Command } from "commander";
import { loadConfig } from "./config.js";
import { XWikiClient } from "./xwiki/client.js";
import { OmnifactClient } from "./omnifact/client.js";
import { loadState, saveState } from "./sync/state.js";
import { syncRoute, dryRunRoute, isExcluded } from "./sync/engine.js";

const program = new Command();

program
  .name("omnifact-xwiki-sync")
  .description("Sync XWiki articles to Omnifact Spaces")
  .version("1.0.0");

program
  .command("sync")
  .description("Sync XWiki pages to Omnifact Spaces")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .option("-s, --space <space>", "Sync only this XWiki space")
  .option("-d, --dry-run", "Show what would change without making changes")
  .option("--debug", "Log every HTTP request URL")
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const xwikiClient = new XWikiClient(config.xwiki, opts.debug);
      const omnifactClient = new OmnifactClient(config.omnifact, opts.debug);
      let state = loadState(config.sync.stateFile);

      const routes = opts.space
        ? config.routes.filter((r) => r.xwikiSpace === opts.space)
        : config.routes;

      if (routes.length === 0) {
        console.error(`No routes found${opts.space ? ` for space "${opts.space}"` : ""}`);
        process.exit(1);
      }

      let hadErrors = false;

      for (const route of routes) {
        console.log(`\nRoute: ${route.xwikiSpace} → ${route.omnifactSpaceId}`);

        if (opts.dryRun) {
          const summary = await dryRunRoute(route, xwikiClient, state);
          console.log(
            `  Summary: ${summary.created} to create, ${summary.updated} to update, ${summary.deleted} to delete, ${summary.skipped} unchanged`
          );
        } else {
          const result = await syncRoute(
            route,
            xwikiClient,
            omnifactClient,
            state,
            config.attachments
          );
          state = result.state;
          // Save after every route so a hard failure later doesn't lose the
          // record of documents already uploaded (which would duplicate them
          // on the next run).
          saveState(config.sync.stateFile, state);
          const s = result.summary;
          console.log(
            `  Summary: ${s.created} created, ${s.updated} updated, ${s.deleted} deleted, ${s.skipped} skipped`
          );
          if (s.errors.length > 0) {
            hadErrors = true;
            console.error(`  Errors:`);
            for (const err of s.errors) {
              console.error(`    - ${err}`);
            }
          }
        }
      }

      if (!opts.dryRun) {
        console.log(`\nState saved to ${config.sync.stateFile}`);
      }
      if (hadErrors) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show current sync state")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .action((opts) => {
    try {
      const config = loadConfig(opts.config);
      const state = loadState(config.sync.stateFile);

      for (const [space, pages] of Object.entries(state)) {
        const pageCount = Object.keys(pages).length;
        console.log(`${space}: ${pageCount} page(s) synced`);
        for (const [name, info] of Object.entries(pages)) {
          const attCount = info.attachmentDocIds?.length || 0;
          console.log(`  - ${name} (v${info.xwikiVersion}, modified: ${info.lastModified}${attCount > 0 ? `, ${attCount} attachment(s)` : ""})`);
        }
      }

      if (Object.keys(state).length === 0) {
        console.log("No sync state found. Run 'sync' first.");
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("list-wikis")
  .description("Recursively list all pages in configured XWiki spaces")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .option("-s, --space <space>", "List only this XWiki space")
  .option("--debug", "Log every HTTP request URL")
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const xwikiClient = new XWikiClient(config.xwiki, opts.debug);

      const routes = opts.space
        ? config.routes.filter((r) => r.xwikiSpace === opts.space)
        : config.routes;

      if (routes.length === 0) {
        console.error(`No routes found${opts.space ? ` for space "${opts.space}"` : ""}`);
        process.exit(1);
      }

      for (const route of routes) {
        console.log(`\nRoute: ${route.xwikiSpace} → ${route.omnifactSpaceId}`);
        const pages = await xwikiClient.listAllPages(route.xwikiSpace);
        let syncCount = 0;
        let excludedCount = 0;

        for (const page of pages) {
          if (isExcluded(page.fullName, route.exclude)) {
            console.log(`  [excluded] ${page.fullName}`);
            excludedCount++;
          } else {
            console.log(`  ${page.fullName}`);
            syncCount++;
          }
        }

        console.log(`  → ${syncCount} page(s)${excludedCount > 0 ? `, ${excludedCount} excluded` : ""}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
