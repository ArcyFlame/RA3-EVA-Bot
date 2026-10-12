import { randomBytes } from 'node:crypto';

export type UpdateStatus =
  | 'available'
  | 'current'
  | 'accepted'
  | 'cancelled'
  | 'busy'
  | 'expired'
  | 'failed'
  | 'unmanaged';
export interface UpdateReply {
  status: UpdateStatus;
  installed?: string;
  version?: string;
  tag?: string;
  token?: string;
  lastUpdateFailed?: boolean;
}

export function requestBotUpdate(
  action: 'check' | 'confirm' | 'cancel',
  token?: string,
): Promise<UpdateReply> {
  if (!process.connected || !process.send || process.env.RA3_UPDATE_PROBATION !== '1') {
    return Promise.resolve({ status: 'unmanaged' });
  }
  const id = randomBytes(16).toString('hex');
  return new Promise((resolve) => {
    const finish = (reply: UpdateReply) => {
      clearTimeout(timer);
      process.removeListener('message', receive);
      process.removeListener('disconnect', disconnected);
      resolve(reply);
    };
    const receive = (message: unknown) => {
      const reply = message as UpdateReply & { type?: string; id?: string };
      if (reply?.type === 'bot-update-response' && reply.id === id) finish(reply);
    };
    const disconnected = () => finish({ status: 'failed' });
    const timer = setTimeout(() => finish({ status: 'failed' }), 60_000);
    timer.unref();
    process.on('message', receive);
    process.once('disconnect', disconnected);
    process.send!({ type: 'bot-update-request', id, action, token }, (error: Error | null) => {
      if (error) finish({ status: 'failed' });
    });
  });
}
