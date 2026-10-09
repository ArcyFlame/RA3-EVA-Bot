'use strict';
const fs = require('node:fs');
const path = require('node:path');
const updater = require('./lib/updater');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const state = updater.readState(updater.paths(root), version);
updater
  .findUpdate(state.version, state.failed)
  .then((release) => {
    console.log(
      JSON.stringify(
        {
          repository: updater.REPOSITORY,
          installedVersion: state.version,
          available: release,
          lastChecked: state.checkedAt ?? null,
          lastError: state.lastError ?? null,
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
