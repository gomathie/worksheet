// Installation-style cards: a variant of the card logging used for
// Classification/QAP, for work types where each unit is a job with its own
// type — and, for some types, a device make. Kept separate from the
// audit-card rules in logic.ts because installations are never
// duplicate-checked: three Teltonika installs in a day is normal, not a
// repeat the way logging the same audit card twice is.

export const INSTALLATION_TYPES = ['telematics_device'] as const
export type InstallationType = (typeof INSTALLATION_TYPES)[number]

export const INSTALLATION_TYPE_LABELS: Record<InstallationType, string> = {
  telematics_device: 'Telematics device',
}

export const DEVICE_TYPES = ['teltonika', 'concox', 'istartek', 'calamp'] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  teltonika: 'Teltonika',
  concox: 'Concox',
  istartek: 'iStartek',
  calamp: 'Calamp',
}

// Whether the job was a fresh install or a swap-out of a unit that had
// failed — same device types either way, but worth tracking separately:
// a month full of replacements says something different than a month full
// of new installs, even at the same total count.
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

export function parseDeviceType(value: unknown): DeviceType | null {
  const s = String(value ?? '')
  return (DEVICE_TYPES as readonly string[]).includes(s) ? (s as DeviceType) : null
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
 * know installation cards exist at all. */
export function installationCardLabel(
  type: InstallationType,
  device: DeviceType | null,
  action: InstallationAction | null,
): string {
  const parts = [INSTALLATION_TYPE_LABELS[type]]
  if (device) parts.push(DEVICE_TYPE_LABELS[device])
  if (action) parts.push(action === 'replacement' ? 'Replacement' : 'New')
  return parts.join(' — ')
}
