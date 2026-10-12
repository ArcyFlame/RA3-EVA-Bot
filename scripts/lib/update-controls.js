'use strict';

const crypto = require('node:crypto');
const REQUEST_ID = /^[a-f0-9]{32}$/;
const CONFIRMATION_MS = 5 * 60_000;

function createUpdateControls({ getState, findUpdate, isBusy, now = Date.now }) {
  let checking = false;
  let confirmation = null;
  let requested = null;
  return {
    async handle(message) {
      if (
        message?.type !== 'bot-update-request' ||
        !REQUEST_ID.test(message.id ?? '') ||
        !['check', 'confirm', 'cancel'].includes(message.action)
      )
        return null;
      const respond = (status, extra = {}) => ({
        type: 'bot-update-response',
        id: message.id,
        status,
        ...extra,
      });
      if (message.action === 'cancel') {
        if (confirmation?.token === message.token) confirmation = null;
        return respond('cancelled');
      }
      if (checking || requested || isBusy()) return respond('busy');
      if (message.action === 'confirm') {
        if (
          !confirmation ||
          confirmation.token !== message.token ||
          now() >= confirmation.expires ||
          confirmation.installed !== getState().version
        )
          return respond('expired');
        requested = confirmation.release;
        confirmation = null;
        return respond('accepted', { version: requested.version });
      }
      checking = true;
      confirmation = null;
      try {
        const state = getState();
        const installed = state.version;
        const release = await findUpdate(installed, state.failed);
        if (isBusy() || installed !== getState().version) return respond('busy');
        if (!release) return respond('current', { installed, lastUpdateFailed: !!state.lastError });
        const token = crypto.randomBytes(16).toString('hex');
        confirmation = { token, release, installed, expires: now() + CONFIRMATION_MS };
        return respond('available', {
          installed,
          version: release.version,
          tag: release.tag,
          token,
        });
      } catch {
        return respond('failed');
      } finally {
        checking = false;
      }
    },
    takeRequested() {
      const release = requested;
      requested = null;
      return release;
    },
    clear() {
      confirmation = null;
      requested = null;
    },
  };
}

module.exports = { createUpdateControls };
