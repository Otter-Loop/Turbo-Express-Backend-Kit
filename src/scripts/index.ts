import { Command } from 'commander';
import sayHelloWorld from './commands/hello-world';
const program = new Command();

program
  .name('myapp-cli')
  .description('CLI tools for MyApp')
  .version('1.0.0');

program
  .command('hello-world')
  .description('Say Hello world')
  .action(sayHelloWorld);

program.parse(process.argv);