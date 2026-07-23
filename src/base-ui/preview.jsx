import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import './tokens.css';
import './preview.css';

const navGroups = [
  ['Command center', ['Overview', 'Garage Mode', 'AI Assistant']],
  ['Build', ['Work Packages', 'Engineering', 'PCB Designer', 'Firmware']],
  ['Operations', ['Motorcycles', 'Parts & BOM', 'Maintenance', 'Ride Log']],
];

function AppShell() {
  return (
    <div className="ui-shell">
      <header className="ui-topbar">
        <div className="ui-brand">
          <span className="ui-brand-mark">M</span>
          <div><strong>Moto Mission</strong><small>Engineering cloud</small></div>
        </div>
        <div className="ui-top-actions">
          <span className="ui-sync"><i />Cloud synced</span>
          <Menu.Root>
            <Menu.Trigger className="ui-avatar" aria-label="Open user menu">M</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} align="end">
                <Menu.Popup className="ui-menu">
                  <Menu.Item className="ui-menu-item">Profile</Menu.Item>
                  <Menu.Item className="ui-menu-item">Settings</Menu.Item>
                  <Menu.Separator className="ui-menu-separator" />
                  <Menu.Item className="ui-menu-item danger">Sign out</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>

      <div className="ui-layout">
        <aside className="ui-sidebar">
          <div className="ui-workspace"><span>WORKSPACE</span><strong>Universal Data System</strong><small>Build · Prove · Ride</small></div>
          {navGroups.map(([group, items]) => (
            <section className="ui-nav-group" key={group}>
              <p>{group}</p>
              {items.map((item, index) => <button className={group === 'Command center' && index === 0 ? 'active' : ''} key={item}>{item}</button>)}
            </section>
          ))}
        </aside>

        <main className="ui-main">
          <div className="ui-page-heading">
            <div><span className="ui-eyebrow">MISSION CONTROL</span><h1>Overview</h1><p>Track the motorcycle, engineering work, and validation evidence.</p></div>
            <Dialog.Root>
              <Dialog.Trigger className="ui-primary">Create work package</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="ui-dialog-backdrop" />
                <Dialog.Popup className="ui-dialog-popup">
                  <Dialog.Title className="ui-dialog-title">Create work package</Dialog.Title>
                  <Dialog.Description className="ui-dialog-description">Define the next engineering task without leaving the dashboard.</Dialog.Description>
                  <label>Title<input placeholder="Example: Validate K-Line interface" /></label>
                  <label>Stage<select defaultValue="1"><option value="1">1 - Standalone Bench Logger</option><option value="2">2 - Ride Testing</option></select></label>
                  <div className="ui-dialog-actions"><Dialog.Close className="ui-secondary">Cancel</Dialog.Close><button className="ui-primary">Create package</button></div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>

          <section className="ui-metrics">
            {[['12','Active packages'],['4','Blocked items'],['83%','Validation coverage'],['2','Motorcycles']].map(([value,label]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
          </section>

          <section className="ui-grid">
            <article className="ui-card ui-card-wide"><div className="ui-card-head"><div><span>ROADMAP</span><h2>Current build stage</h2></div><button className="ui-text-button">View all</button></div><div className="ui-progress"><i /></div><div className="ui-stage-row"><strong>Standalone Bench Logger</strong><span>8 of 11 validated</span></div></article>
            <article className="ui-card"><div className="ui-card-head"><div><span>GARAGE</span><h2>CRF450RL</h2></div><b className="ui-status">READY</b></div><dl><div><dt>Mileage</dt><dd>4,218 mi</dd></div><div><dt>Open maintenance</dt><dd>2</dd></div><div><dt>Last ride</dt><dd>Yesterday</dd></div></dl></article>
            <article className="ui-card"><div className="ui-card-head"><div><span>SYSTEM</span><h2>Data logger</h2></div><b className="ui-status amber">BENCH</b></div><p className="ui-muted">ESP32-S3, GPS, IMU, storage, and power validation.</p><button className="ui-secondary full">Open engineering package</button></article>
          </section>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('base-ui-root')).render(<AppShell />);
