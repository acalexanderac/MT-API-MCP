import crypto from 'node:crypto';
import { newUuid } from './rand.js';
import { singularize } from './synth.js';
import { now } from './resources.js';

/**
 * Event log + webhook dispatcher.
 *
 * Every create/update/delete appends an `event` record (readable through
 * `GET /api/events`) and, when a webhook URL is configured, posts it with the
 * `X-Signature` HMAC header the API uses.
 */
export class EventBus {
  constructor({ store, webhookUrl = null, webhookKey = 'webhook-key', liveMode = false, logger = console }) {
    this.store = store;
    this.webhookUrl = webhookUrl;
    this.webhookKey = webhookKey;
    this.liveMode = liveMode;
    this.logger = logger;
  }

  /** `payment_order` + `created` -> `payment_order.created` */
  emit(resource, action, record) {
    const objectName = singularize(resource);
    const timestamp = now();
    const event = {
      id: newUuid(),
      object: 'event',
      created_at: timestamp,
      updated_at: timestamp,
      data: record,
      entity_id: record?.id ?? null,
      event_name: `${objectName}.${action}`,
      event_time: timestamp,
      live_mode: this.liveMode,
      resource: objectName,
    };
    this.store.insert('events', event);
    this.deliver(event);
    return event;
  }

  signature(payload) {
    return crypto.createHmac('sha256', this.webhookKey).update(payload).digest('hex');
  }

  deliver(event) {
    if (!this.webhookUrl) return;
    const payload = JSON.stringify(event);
    fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': this.signature(payload),
      },
      body: payload,
    }).catch((err) => this.logger.warn?.(`webhook delivery failed: ${err.message}`));
  }
}
