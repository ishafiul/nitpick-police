#!/usr/bin/env node

/**
 * Post-merge hook script for handling merge commits
 * This script is executed by Git after each merge to trigger background indexing
 */

const path = require('path');
const { spawn } = require('child_process');

// Get the merge commit SHA from command line arguments
const mergeSha = process.argv[2];

if (!mergeSha) {
  console.error('Error: No merge commit SHA provided');
  process.exit(1);
}

console.log(`Starting background indexing for merge commit: ${mergeSha}`);

// Get the project root (this script should be in scripts/ directory)
const projectRoot = path.resolve(__dirname, '..');

// Change to project directory
process.chdir(projectRoot);

// Spawn the indexing process in background for merge commits
const indexingProcess = spawn('node', [
  path.join(projectRoot, 'dist', 'cli', 'index.js'),
  'index',
  '--commit', mergeSha,
  '--merge',
  '--background'
], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: projectRoot
});

// Log output but don't wait for completion
indexingProcess.stdout?.on('data', (data) => {
  console.log(`[Merge Indexing] ${data.toString().trim()}`);
});

indexingProcess.stderr?.on('data', (data) => {
  console.error(`[Merge Indexing Error] ${data.toString().trim()}`);
});

// Detach the process so it runs independently
indexingProcess.unref();

console.log(`Background merge indexing process started (PID: ${indexingProcess.pid})`);
console.log('Merge completed successfully - indexing will continue in background');

// Exit immediately to not block the merge
process.exit(0);
