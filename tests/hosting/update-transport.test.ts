import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestBotUpdate } from '../../src/services/bot-update.service';

const sendDescriptor = Object.getOwnPropertyDescriptor(process, 'send');
const connectedDescriptor = Object.getOwnPropertyDescriptor(process, 'connected');
const send = vi.fn();
beforeEach(() => {
  send.mockReset();
  Object.defineProperty(process, 'send', { value: send, configurable: true });
  Object.defineProperty(process, 'connected', { value: true, configurable: true });
  vi.stubEnv('RA3_UPDATE_PROBATION', '1');
});
afterEach(() => {
  for (const [key, descriptor] of [
    ['send', sendDescriptor],
    ['connected', connectedDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(process, key, descriptor);
    else delete (process as unknown as Record<string, unknown>)[key];
  }
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('bot-to-host update transport', () => {
  it('correlates the response and releases listeners after completion', async () => {
    const count = process.listenerCount('message');
    const pending = requestBotUpdate('check');
    const message = send.mock.calls[0][0];
    process.emit('message', { type: 'bot-update-response', id: 'wrong', status: 'failed' });
    expect(process.listenerCount('message')).toBe(count + 1);
    process.emit('message', {
      type: 'bot-update-response',
      id: message.id,
      status: 'current',
      installed: '5.4.0',
    });
    expect(await pending).toMatchObject({ status: 'current', installed: '5.4.0' });
    expect(process.listenerCount('message')).toBe(count);
  });
  it('cleans up if the host times out or the send fails', async () => {
    vi.useFakeTimers();
    const count = process.listenerCount('message');
    const pending = requestBotUpdate('check');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ status: 'failed' });
    expect(process.listenerCount('message')).toBe(count);
    send.mockImplementationOnce((_message, callback) => callback(new Error('IPC closed')));
    expect(await requestBotUpdate('confirm', 'a'.repeat(32))).toEqual({ status: 'failed' });
    expect(process.listenerCount('message')).toBe(count);
  });
  it('does not send commands to an unmanaged process', async () => {
    vi.stubEnv('RA3_UPDATE_PROBATION', '0');
    expect(await requestBotUpdate('check')).toEqual({ status: 'unmanaged' });
    expect(send).not.toHaveBeenCalled();
  });
});
