#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const skills = [
  { key: 'video', source: 'google-flow-video_v5', name: 'google-flow-video' },
  { key: 'merge', source: 'google-flow-video-merge_v1', name: 'google-flow-video-merge' },
];

function main() {
  const args = process.argv.slice(2);
  let global = false;
  let force = false;
  let selection = 'all';
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        console.log(`Usage: google-flow-video-skills [--global] [--skill video|merge|all] [--force]

Default: install both skills into .claude/skills/ in the current directory.
  --global       Install into ~/.claude/skills/ for all projects
  --skill NAME   Install video, merge, or all (default)
  --force        Allow overwriting files in existing skill directories

This command copies skill files only. It does not run video scripts or install Python dependencies.`);
        return;
      case '--global': global = true; break;
      case '--force': force = true; break;
      case '--skill':
        selection = args[++i];
        if (!['video', 'merge', 'all'].includes(selection)) {
          throw new Error('--skill must be video, merge, or all.');
        }
        break;
      default: throw new Error(`Unknown option: ${args[i]}. Use --help.`);
    }
  }

  const root = path.join(global ? os.homedir() : process.cwd(), '.claude', 'skills');
  const selected = skills.filter(skill => selection === 'all' || skill.key === selection);
  // Check all destinations before copying so a conflict does not partially install the set.
  for (const skill of selected) {
    const target = path.join(root, skill.name);
    let stat;
    try { stat = fs.lstatSync(target); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new Error(`Destination is not a regular directory: ${target}`);
    }
    if (stat && !force) {
      throw new Error(`Skill already exists: ${target}. Use --force to overwrite files.`);
    }
    fs.accessSync(path.join(__dirname, '..', skill.source, 'SKILL.md'));
  }
  fs.mkdirSync(root, { recursive: true });
  for (const skill of selected) {
    const target = path.join(root, skill.name);
    fs.cpSync(path.join(__dirname, '..', skill.source), target, { recursive: true, force });
    console.log(`Installed ${skill.name}: ${target}`);
  }
  console.log('Open Claude Code in your project to use the skills.');
}

try { main(); } catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
