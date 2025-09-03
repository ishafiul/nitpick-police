import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { logError } from '../../utils';

export function configCommand(program: Command): void {
  program
    .command('config')
    .description('Manage configuration settings')
    .option('-s, --show', 'Show current configuration')
    .option('-e, --edit', 'Edit configuration in editor')
    .option('-r, --reset', 'Reset to default configuration')
    .option('--get <key>', 'Get specific configuration value')
    .option('--set-key <key>', 'Key to set')
    .option('--set-value <value>', 'Value to set')
    .option('--validate', 'Validate current configuration')
    .option('--export <path>', 'Export configuration to file')
    .option('--import <path>', 'Import configuration from file')
    .action(async (options) => {
      try {
        const { show, reset, get, setKey, setValue, validate, export: exportPath, import: importPath } = options;
        
        const configFile = path.join(process.cwd(), '.code_review', 'config.json');
        
        if (!fs.existsSync(configFile)) {
          console.error(chalk.red('❌ Configuration file not found. Run "code-review init" to create default config.'));
          process.exit(1);
        }

        const currentConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        
        if (show) {
          console.log(chalk.blue('⚙️  Current Configuration:'));
          console.log(JSON.stringify(currentConfig, null, 2));
          return;
        }
        
        if (get) {
          const value = getNestedValue(currentConfig, get);
          if (value !== undefined) {
            console.log(chalk.cyan(`${get}:`), value);
          } else {
            console.error(chalk.red(`❌ Configuration key "${get}" not found`));
            process.exit(1);
          }
          return;
        }
        
        if (setKey && setValue) {
          const key = setKey;
          const value = setValue;

                const keys = key.split('.');
                let current = currentConfig;

                for (let i = 0; i < keys.length - 1; i++) {
                  if (!current[keys[i]]) {
                    current[keys[i]] = {};
                  }
                  current = current[keys[i]];
                }

                const lastKey = keys[keys.length - 1];
                current[lastKey] = value;

                fs.writeFileSync(configFile, JSON.stringify(currentConfig, null, 2));
                console.log(chalk.green(`✅ Set ${key} = ${value}`));
                return;
        }
        
                    if (reset) {

              const defaultConfig = {
                llm: {
                  provider: 'ollama',
                  model: 'mistral:7b-instruct',
                  temperature: 0.1,
                  maxTokens: 2048
                },
                vectorDB: {
                  provider: 'qdrant',
                  url: 'http://localhost:6333',
                  collection: 'code-review'
                },
                git: {
                  hooks: true,
                  autoIndex: true
                },
                review: {
                  maxFileSize: 1024 * 1024,
                  supportedLanguages: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs']
                }
              };
              
              fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
              console.log(chalk.green('✅ Configuration reset to defaults'));
              return;
            }
        
        if (validate) {
          console.log(chalk.blue('🔍 Validating configuration...'));
          
          const validationResult = validateConfig(currentConfig);
          if (validationResult.valid) {
            console.log(chalk.green('✅ Configuration is valid'));
          } else {
            console.log(chalk.red('❌ Configuration validation failed:'));
            validationResult.errors.forEach(error => {
              console.log(chalk.red(`  - ${error}`));
            });
          }
          return;
        }
        
        if (exportPath) {
          try {
            fs.writeFileSync(exportPath, JSON.stringify(currentConfig, null, 2));
            console.log(chalk.green(`✅ Configuration exported to: ${exportPath}`));
          } catch (error) {
            console.error(chalk.red(`❌ Failed to export configuration: ${error}`));
            process.exit(1);
          }
          return;
        }
        
        if (importPath) {
          try {
                            const importedConfig = JSON.parse(fs.readFileSync(importPath, 'utf8'));

                const validationResult = validateConfig(importedConfig);
                if (!validationResult.valid) {
                  console.error(chalk.red('❌ Imported configuration is invalid:'));
                  validationResult.errors.forEach(error => {
                    console.error(chalk.red(`  - ${error}`));
                  });
                  process.exit(1);
                }
                
                fs.writeFileSync(configFile, JSON.stringify(importedConfig, null, 2));
            console.log(chalk.green(`✅ Configuration imported from: ${importPath}`));
          } catch (error) {
            console.error(chalk.red(`❌ Failed to import configuration: ${error}`));
            process.exit(1);
          }
          return;
        }

        console.log(chalk.blue('⚙️  Configuration Summary:'));
        console.log(chalk.cyan('Local LLM Provider:'), currentConfig.local_llm?.provider || 'Not set');
        console.log(chalk.cyan('Local LLM Model:'), currentConfig.local_llm?.model || 'Not set');
        console.log(chalk.cyan('Local LLM Base URL:'), currentConfig.local_llm?.base_url || 'Not set');
        console.log(chalk.cyan('Cloud LLM Provider:'), currentConfig.cloud_llm?.provider || 'Not set');
        console.log(chalk.cyan('Cloud LLM Model:'), currentConfig.cloud_llm?.model || 'Not set');
        console.log(chalk.cyan('Cloud LLM API Key:'), currentConfig.cloud_llm?.api_key ? 'Set' : 'Not set');
        console.log(chalk.cyan('Qdrant URL:'), currentConfig.qdrant?.url || 'Not set');
        console.log(chalk.cyan('Environment:'), currentConfig.environment || 'Not set');
        
        console.log(chalk.yellow('\n💡 Use --show for full configuration, --help for all options'));
        
      } catch (error) {
        logError('❌ Failed to manage configuration', error as Error);
        console.error(chalk.red('❌ Failed to manage configuration:'), error);
        process.exit(1);
      }
    });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function validateConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.local_llm?.provider) {
    errors.push('Local LLM provider not specified');
  }

  if (!config.local_llm?.model) {
    errors.push('Local LLM model not specified');
  }

  if (!config.cloud_llm?.provider) {
    errors.push('Cloud LLM provider not specified');
  }

  if (!config.cloud_llm?.model) {
    errors.push('Cloud LLM model not specified');
  }
  
  if (!config.qdrant?.url) {
    errors.push('Qdrant URL not specified');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
