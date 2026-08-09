// Installation-style cards: a variant of the card logging used for
// Classification/QAP, for work types where each unit is a job with its own
// type — and, for some types, a device make. Kept separate from the
// audit-card rules in logic.ts because installations are never
// duplicate-checked: three Teltonika installs in a day is normal, not a
// repeat the way logging the same audit card twice is.
//
// Device makes themselves (Teltonika, Concox, ...) are admin-managed — see
// the device_types table and /api/device-types — rather than a fixed list
// here, so a newly-carried brand doesn't need a deploy. This file only knows
// their ids are strings; validating one exists and is active is a DB lookup,
// done server-side in functions/api/[[route]].ts.

export const INSTALLATION_TYPES = ['telematics_device'] as const
export type InstallationType = (typeof INSTALLATION_TYPES)[number]

export const INSTALLATION_TYPE_LABELS: Record<InstallationType, string> = {
  telematics_device: 'Telematics device',
}

// Whether the job was a fresh install or a swap-out of a unit that had
// failed — same device types either way, but worth tracking separately:
// a month full of replacements says something different than a month full
// of new installs, even at the same total count. A replacement also records
// which make came out (entry_cards.replaced_device_type), so reporting can
// answer "which makes fail most often, and what replaces them".
export const INSTALLATION_ACTIONS = ['new_install', 'replacement'] as const
export type InstallationAction = (typeof INSTALLATION_ACTIONS)[number]

export const INSTALLATION_ACTION_LABELS: Record<InstallationAction, string> = {
  new_install: 'New installation',
  replacement: 'Replacement (faulty device)',
}

export function parseInstallationType(value: unknown): InstallationType | null {
  const s = String(value ?? '')
  return (INSTALLATION_TYPES as readonly string[]).includes(s) ? (s as InstallationType) : null
}

export function parseInstallationAction(value: unknown): InstallationAction | null {
  const s = String(value ?? '')
  return (INSTALLATION_ACTIONS as readonly string[]).includes(s)
    ? (s as InstallationAction)
    : null
}

/** Only telematics-device installs have a device make and a new/replacement
 * action today; written as lookups rather than inline checks so a future
 * installation type can opt in without touching every call site. */
export function needsDeviceType(type: InstallationType): boolean {
  return type === 'telematics_device'
}
export function needsAction(type: InstallationType): boolean {
  return type === 'telematics_device'
}

/** The label shown wherever a plain card name would otherwise appear
 * (recent entries, CSV export, reports) — so nothing downstream needs to
 * know installation cards exist at all. Device names are passed in already
 * resolved (they come from the device_types table, not a fixed map here). */
export function installationCardLabel(
  type: InstallationType,
  deviceName: string | null,
  action: InstallationAction | null,
  replacedDeviceName: string | null = null,
): string {
  const parts = [INSTALLATION_TYPE_LABELS[type]]
  if (deviceName) {
    parts.push(
      action === 'replacement' && replacedDeviceName
        ? `${replacedDeviceName} → ${deviceName}`
        : deviceName,
    )
  }
  if (action) parts.push(action === 'replacement' ? 'Replacement' : 'New')
  return parts.join(' — ')
}
