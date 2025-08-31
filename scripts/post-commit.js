#!/usr/bin/env node

/**
 * Post-commit hook script for automatic commit indexing
 * This script is executed by Git after each commit to trigger background indexing
 */

const path = require('path');
const { spawn } = require('child_process');

// Get the commit SHA from command line arguments
const commitSha = process.argv[2];

if (!commitSha) {
  console.error('Error: No commit SHA provided');
  process.exit(1);
}

console.log(`Starting background indexing for commit: ${commitSha}`);

// Get the project root (this script should be in scripts/ directory)
const projectRoot = path.resolve(__dirname, '..');

// Change to project directory
process.chdir(projectRoot);

// Spawn the indexing process in background
const indexingProcess = spawn('node', [
  path.join(projectRoot, 'dist', 'cli', 'index.js'),
  'index',
  '--commit', commitSha,
  '--background'
], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: projectRoot
});

// Log output but don't wait for completion
indexingProcess.stdout?.on('data', (data) => {
  console.log(`[Indexing] ${data.toString().trim()}`);
});

indexingProcess.stderr?.on('data', (data) => {
  console.error(`[Indexing Error] ${data.toString().trim()}`);
});

// Detach the process so it runs independently
indexingProcess.unref();

console.log(`Background indexing process started (PID: ${indexingProcess.pid})`);
console.log('Commit completed successfully - indexing will continue in background');

// Exit immediately to not block the commit
process.exit(0);
