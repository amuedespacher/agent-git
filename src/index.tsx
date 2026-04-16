#!/usr/bin/env node
import process from "node:process";

import { render } from "ink";

import { App } from "./ui/App.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  printVersion();
  process.exit(0);
}

render(<App cwd={process.cwd()} />);

function printHelp() {
  process.stdout.write(
    [
      "drgit",
      "",
      "Usage:",
      "  drgit",
      "  drgit --help",
      "  drgit --version",
      "",
      "Run the interactive Git assistant from inside a repository.",
    ].join("\n") + "\n",
  );
}

function printVersion() {
  process.stdout.write("0.1.0\n");
}
