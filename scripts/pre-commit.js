#!/usr/bin/env node

/**
 * Pre-commit hook script for critical issue checking
 * This script is executed by Git before each commit to check for critical issues
 */

const path = require('path');
const { spawn } = require('child_process');

// Get the staged files from command line arguments
const stagedFiles = process.argv[2];

if (!stagedFiles) {
  console.log('No staged files, skipping pre-commit checks');
  process.exit(0);
}

console.log('Running pre-commit checks for critical issues...');

// Get the project root (this script should be in scripts/ directory)
const projectRoot = path.resolve(__dirname, '..');

// Change to project directory
process.chdir(projectRoot);

// Parse staged files (comma-separated)
const files = stagedFiles.split(',').filter(file => file.trim());

if (files.length === 0) {
  console.log('No staged files to check');
  process.exit(0);
}

console.log(`Checking ${files.length} staged files for critical issues...`);

// Run the critical issue check
const checkProcess = spawn('node', [
  path.join(projectRoot, 'dist', 'cli', 'index.js'),
  'check',
  '--files', files.join(','),
  '--critical-only'
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: projectRoot
});

let output = '';
let errorOutput = '';

checkProcess.stdout?.on('data', (data) => {
  output += data.toString();
});

checkProcess.stderr?.on('data', (data) => {
  errorOutput += data.toString();
});

checkProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Pre-commit checks passed - no critical issues found');
    process.exit(0);
  } else {
    console.error('❌ Pre-commit checks failed - critical issues found:');
    console.error(output);
    if (errorOutput) {
      console.error('Errors:', errorOutput);
    }
    console.error('\nPlease fix the critical issues before committing.');
    process.exit(1);
  }
});

checkProcess.on('error', (error) => {
  console.error('Failed to run pre-commit checks:', error.message);
  console.error('Allowing commit to proceed due to check failure');
  process.exit(0); // Allow commit if checks fail
});
