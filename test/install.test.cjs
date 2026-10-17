'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../bin/install.cjs');
function project(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-skills-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

test('installs both complete skills into a project', t => {
  const cwd = project(t);
  assert.equal(run(cwd).status, 0);
  for (const [folder, script] of [
    ['google-flow-video', 'google_flow_automation.js'],
    ['google-flow-video-merge', 'merge_videos.py'],
  ]) {
    const target = path.join(cwd, '.claude/skills', folder);
    assert.ok(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').startsWith('---'));
    assert.ok(fs.existsSync(path.join(target, 'scripts', script)));
    assert.ok(fs.statSync(path.join(target, 'references')).isDirectory());
  }
});

test('conflicts preserve user changes; --force explicitly permits updates', t => {
  const cwd = project(t);
  assert.equal(run(cwd, '--skill', 'merge').status, 0);
  const target = path.join(cwd, '.claude/skills/google-flow-video-merge/SKILL.md');
  fs.writeFileSync(target, 'user changes');
  assert.equal(run(cwd).status, 1);
  assert.equal(fs.readFileSync(target, 'utf8'), 'user changes');
  assert.equal(fs.existsSync(path.join(cwd, '.claude/skills/google-flow-video')), false);
  assert.equal(run(cwd, '--skill', 'merge', '--force').status, 0);
  assert.notEqual(fs.readFileSync(target, 'utf8'), 'user changes');
});

test('invalid arguments and help do not install files', t => {
  const cwd = project(t);
  assert.equal(run(cwd, '--skill').status, 1);
  assert.equal(run(cwd, '--unknown').status, 1);
  assert.equal(run(cwd, '--help').status, 0);
  assert.equal(fs.existsSync(path.join(cwd, '.claude')), false);
});

test('--global installs only the selected skill into the user home', t => {
  const cwd = project(t);
  const home = project(t);
  const result = spawnSync(process.execPath, [cli, '--global', '--skill', 'video'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(home, '.claude/skills/google-flow-video/SKILL.md')));
  assert.equal(fs.existsSync(path.join(home, '.claude/skills/google-flow-video-merge')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.claude')), false);
});
