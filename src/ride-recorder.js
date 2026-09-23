// The recorder owns persistence/lifecycle; views only consume snapshots.
export class RideRecorder {
  constructor({ journal, synchronize, acquireCapture, watch, unwatch, changed = () => {}, context = () => ({}), stopped = () => {} }) {
    Object.assign(this, { journal, synchronize, acquireCapture, watch, unwatch, changed, context, stopped });
    this.owner = null; this.ride = null; this.recording = false; this.starting = false;
    this.syncing = false; this.error = ''; this.writeQueue = Promise.resolve(); this.generation = 0;
  }
  emit() { this.changed(this); }
  release() { if (this.watchId !== undefined) this.unwatch(this.watchId); this.watchId = undefined; this.releaseLock?.(); this.releaseLock = null; this.recording = false; }
  async setOwner(owner) {
    const generation = this.owner === owner ? this.generation : ++this.generation;
    if (this.owner !== owner) { this.release(); this.owner = owner; this.ride = null; this.error = ''; this.emit(); }
    if (!owner) return;
    const rides = await this.journal.list(owner);
    if (generation !== this.generation) return;
    if (!this.ride) this.ride = rides.find(r => r.status === 'recording') || rides.find(r => r.status === 'pending') || null;
    this.emit();
  }
  async start(bike) {
    if (!this.owner) throw new Error('Sign in before recording.');
    if (this.starting || this.ride) throw new Error('Recover or finish the existing local ride first.');
    const owner = this.owner, generation = this.generation;
    this.starting = true; this.error = ''; this.emit();
    try {
      const release = await this.acquireCapture();
      if (owner !== this.owner || generation !== this.generation) { release(); throw new Error('Account changed.'); }
      this.releaseLock = release;
      const ride = await this.journal.create(owner, bike);
      if (owner !== this.owner || generation !== this.generation) throw new Error('Account changed; local ride preserved.');
      this.ride = ride; this.capture();
    } catch (error) { this.release(); this.error = error.message; throw error; }
    finally { this.starting = false; this.emit(); }
  }
  async resume() {
    if (!this.ride || this.ride.status !== 'recording' || this.recording || this.starting) return;
    const owner = this.owner, id = this.ride.id, generation = this.generation;
    this.starting = true; this.emit();
    try {
      const release = await this.acquireCapture();
      if (owner !== this.owner || generation !== this.generation) { release(); throw new Error('Account changed.'); }
      this.releaseLock = release;
      const ride = await this.journal.resume(owner, id);
      if (owner !== this.owner || generation !== this.generation) throw new Error('Account changed.');
      this.ride = ride; this.error = ''; this.capture(); this.emit();
    } catch (error) { this.release(); this.error = error.message; throw error; }
    finally { this.starting = false; this.emit(); }
  }
  capture() {
    const owner = this.owner, id = this.ride.id;
    this.recording = true;
    this.watchId = this.watch(position => {
      if (!this.recording || this.owner !== owner || this.ride?.id !== id) return;
      const context = this.context();
      this.writeQueue = this.writeQueue.then(async () => {
        const ride = await this.journal.append(owner, id, position, context);
        if (this.owner !== owner || this.ride?.id !== id) return;
        this.ride = ride; this.error = ''; this.emit();
      }).catch(error => {
        if (this.owner !== owner) return;
        this.release(); this.error = `Recording paused: ${error.message} Last confirmed data remains on this device.`; this.emit();
      });
    }, error => { if (this.owner === owner) { this.error = `GPS unavailable: ${error.message}`; this.emit(); } });
  }
  async stop() {
    if (!this.ride) return;
    const owner = this.owner, id = this.ride.id;
    this.release(); await this.writeQueue;
    const ride = await this.journal.stop(owner, id);
    if (this.owner !== owner) return;
    this.ride = ride; this.emit(); this.stopped(ride); await this.sync();
  }
  async motion(input) {
    if (!this.recording || !this.ride) return;
    const owner = this.owner, id = this.ride.id;
    this.writeQueue = this.writeQueue.then(async () => {
      const ride = await this.journal.appendMotion(owner, id, input);
      if (this.owner === owner && this.ride?.id === id) { this.ride = ride; this.emit(); }
    }).catch(error => {
      if (this.owner === owner) { this.release(); this.error = `Motion storage failed: ${error.message}`; this.emit(); }
    });
    return this.writeQueue;
  }
  async sync() {
    if (!this.owner || this.syncing) return;
    const owner = this.owner;
    this.syncing = true; this.emit();
    try {
      await this.synchronize(owner, value => value === this.owner);
      if (owner === this.owner) this.error = '';
    } catch (error) { if (owner === this.owner) this.error = `Saved on this device; upload pending. ${error.message}`; }
    finally {
      this.syncing = false;
      if (owner === this.owner) {
        let records;
        try { records = await this.journal.list(owner); }
        catch (error) { this.error = `Local ride storage unavailable: ${error.message}`; this.emit(); return; }
        if (owner !== this.owner) return;
        this.ride = records.find(r => r.id === this.ride?.id && ['recording', 'pending'].includes(r.status))
          || records.find(r => r.status === 'recording') || records.find(r => r.status === 'pending') || null;
        this.emit();
      }
    }
  }
  async discard() {
    if (!this.ride) return;
    if (this.syncing) throw new Error('Wait for synchronization to finish before discarding.');
    const owner = this.owner, id = this.ride.id;
    this.release(); await this.writeQueue;
    await this.journal.markDiscarded(owner, id);
    if (this.owner !== owner) return;
    this.ride = null; this.emit(); await this.sync();
  }
}
