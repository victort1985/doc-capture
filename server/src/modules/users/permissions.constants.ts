import { UserRole } from './entities/user.entity';

/** Every gate-able feature in the app. Keys follow `domain.action`.
 * Adding a new gated feature = add a key here + a role default below;
 * nothing else needs to know the full list. */
export const FEATURE_KEYS = [
  'calls.create', 'calls.edit', 'calls.delete', 'calls.close', 'calls.stats',
  'calendar.view', 'calendar.edit', 'calendar.all_orgs',
  'fleet.view', 'fleet.refuel', 'fleet.manage', 'fleet.documents',
  'warehouse.view', 'warehouse.transactions', 'warehouse.manage',
  'reports.work', 'reports.fuel',
  'phonebook.edit',
  'orgs.switch',
  // "Office" tab (mobile) — each key gates one sub-tab. A user with
  // none of these doesn't see the Office tab at all.
  'office.delivery_notes', 'office.quotes', 'office.invoices', 'office.orders', 'office.payments',
  'office.returns', 'office.credit_notes', 'office.debit_notes', 'office.expenses', 'office.rentals',
  // Mobile Time Clock screen — shows the employee their own running
  // monthly gross-pay total (see PayrollSelfServiceController's own
  // my-payslip endpoint) at the bottom of the screen if granted, or
  // the screen behaves exactly as if this key didn't exist otherwise.
  'payroll.viewMonthlyGrossSalary',
  // Unlike every key above (which only ever hides/shows something
  // inside an already-logged-in session), this one gates the login
  // itself — see AuthService.login()'s enforcement for
  // X-Client-Type: admin-panel. A person can be a perfectly normal
  // mobile-app user (technician, driver, etc) with zero business
  // reason to ever open the web admin panel; this lets an admin
  // scope who's even allowed to try.
  'system.adminPanelAccess',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Defaults applied when neither the user nor their group has an
 * explicit override for a key. New features default to OFF for
 * regular users — a permission has to be deliberately granted, never
 * assumed, so rolling out a new gated feature never silently exposes
 * it to everyone. */
export const ROLE_DEFAULTS: Record<UserRole, Record<FeatureKey, boolean>> = {
  [UserRole.ADMIN]: Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>,
  [UserRole.USER]: {
    'calls.create': true, 'calls.edit': false, 'calls.delete': false, 'calls.close': true, 'calls.stats': false,
    'calendar.view': true, 'calendar.edit': true, 'calendar.all_orgs': false,
    'fleet.view': true, 'fleet.refuel': true, 'fleet.manage': false, 'fleet.documents': false,
    'warehouse.view': true, 'warehouse.transactions': true, 'warehouse.manage': false,
    'reports.work': false, 'reports.fuel': false,
    'phonebook.edit': false,
    'orgs.switch': false,
    'office.delivery_notes': false, 'office.quotes': false, 'office.invoices': false, 'office.orders': false, 'office.payments': false,
    'office.returns': false, 'office.credit_notes': false, 'office.debit_notes': false, 'office.expenses': false, 'office.rentals': false,
    'payroll.viewMonthlyGrossSalary': false,
    'system.adminPanelAccess': false,
  },
};

/** user override > group override > role default. Both override maps
 * only carry keys someone explicitly set — anything absent falls
 * through to the next layer. */
export function resolveEffectivePermissions(
  role: UserRole,
  groupPermissions: Partial<Record<string, boolean>> | null | undefined,
  userPermissions: Partial<Record<string, boolean>> | null | undefined,
): Record<FeatureKey, boolean> {
  const result = { ...ROLE_DEFAULTS[role] };
  for (const key of FEATURE_KEYS) {
    if (groupPermissions && groupPermissions[key] !== undefined) result[key] = !!groupPermissions[key];
    if (userPermissions && userPermissions[key] !== undefined) result[key] = !!userPermissions[key];
  }
  return result;
}
