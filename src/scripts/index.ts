import { Command } from "commander";
import sayHelloWorld from "./commands/hello-world";
import { generateApiContract } from "./commands/generate-api-contract";
const program = new Command();

program.name("myapp-cli").description("CLI tools for MyApp").version("1.0.0");

program
  .command("hello-world")
  .description("Say Hello world")
  .action(sayHelloWorld);

program
  .command("generate-api-contract [routes-dir]")
  .description("Generate OpenAPI contract")
  .option("--entry <file>", "Entry file to trace mount prefixes from")
  .option("--out <file>", "Write output to file instead of stdout")
  .option("--format <format>", 'Output format: "ts" (default) | "json"', "ts")
  .option("--tsconfig <file>", "Path to tsconfig.json")
  .action((routesDir, options) => {
    const args = [];
    if (routesDir) args.push(routesDir);
    if (options.entry) args.push("--entry", options.entry);
    if (options.out) args.push("--out", options.out);
    else args.push("--out", "static/protected/contract.d.ts");
    if (options.format) args.push("--format", options.format);
    if (options.tsconfig) args.push("--tsconfig", options.tsconfig);

    process.argv = ["node", "script.ts", ...args];
    generateApiContract();
  });

program.parse(process.argv);
