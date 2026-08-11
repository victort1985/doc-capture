import {
  PhoneCall, Contact, MapPin, Tag, FileSpreadsheet, ReceiptText, FileText, Undo2, Banknote, Handshake, BellRing, FolderKanban, ShoppingCart,
  FileMinus, FilePlus2, CreditCard, TrendingUp, BookOpen, Receipt, Landmark, Package, Car, Repeat,
  CalendarClock, BarChart2, Users, ShieldCheck, Users2, HardDrive, FileSliders, FileStack,
  Smartphone, CalendarDays, ScrollText, Building2, Palette, HardDriveDownload, Timer, PackageSearch, ArrowLeftRight, FileDown, Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  items: NavItem[];
}

/** Single source of truth for navigation, shared by both the sidebar
 * (list+groups) and tiles (home dashboard) presentations — see
 * SidebarLayout.tsx / TilesLayout.tsx. Reorganized from a 40-entry
 * flat list into 8 groups per the navigation audit: each document
 * type's "-settings" page is kept as its own sub-item for now rather
 * than folded into a tab inside its parent page (a bigger separate
 * change), but grouping alone already cuts the visual list size
 * roughly in half.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'timeClock',
    labelKey: 'navGroups.timeClock',
    icon: Timer,
    items: [
      { to: '/time-clock', labelKey: 'nav.timeClock', icon: Timer },
      { to: '/timesheet', labelKey: 'nav.timesheet', icon: BarChart2, adminOnly: true },
    ],
  },
  {
    key: 'crm',
    labelKey: 'navGroups.crm',
    icon: PhoneCall,
    items: [
      { to: '/calls', labelKey: 'nav.calls', icon: PhoneCall },
      { to: '/crm-deals', labelKey: 'nav.crmDeals', icon: Handshake },
      { to: '/phonebook', labelKey: 'nav.phonebook', icon: Contact },
      { to: '/locations', labelKey: 'nav.locations', icon: MapPin },
    ],
  },
  {
    key: 'documents',
    labelKey: 'navGroups.documents',
    icon: FileSpreadsheet,
    items: [
      { to: '/prices', labelKey: 'nav.prices', icon: Tag },
      { to: '/quotes', labelKey: 'nav.quotes', icon: FileSpreadsheet },
      { to: '/orders', labelKey: 'nav.orders', icon: ReceiptText },
      { to: '/delivery-notes', labelKey: 'nav.deliveryNotes', icon: FileText },
      { to: '/returns', labelKey: 'nav.returns', icon: Undo2 },
      { to: '/invoices', labelKey: 'nav.invoices', icon: Banknote },
      { to: '/credit-notes', labelKey: 'nav.creditNotes', icon: FileMinus },
      { to: '/debit-notes', labelKey: 'nav.debitNotes', icon: FilePlus2 },
      { to: '/payments', labelKey: 'nav.payments', icon: CreditCard },
    ],
  },
  {
    key: 'finance',
    labelKey: 'navGroups.finance',
    icon: TrendingUp,
    adminOnly: true,
    items: [
      { to: '/financial-reports', labelKey: 'nav.financialReports', icon: TrendingUp },
      { to: '/payslip', labelKey: 'nav.payslip', icon: FileDown },
      { to: '/accounting', labelKey: 'nav.accounting', icon: BookOpen },
      { to: '/recurring-documents', labelKey: 'nav.recurringDocuments', icon: Repeat },
      { to: '/cost-centers', labelKey: 'nav.costCenters', icon: FolderKanban },
      { to: '/salary-settings', labelKey: 'nav.salarySettings', icon: Wallet },
      { to: '/expenses', labelKey: 'nav.expenses', icon: Receipt },
      { to: '/tax-authority-settings', labelKey: 'nav.taxAuthority', icon: Landmark },
      { to: '/overdue-reminders', labelKey: 'nav.overdueReminders', icon: BellRing },
      { to: '/card-acquiring-settings', labelKey: 'nav.cardAcquiring', icon: CreditCard },
      { to: '/currency-rates', labelKey: 'nav.currencyRates', icon: TrendingUp },
    ],
  },
  {
    key: 'warehouseFleet',
    labelKey: 'navGroups.warehouseFleet',
    icon: Package,
    items: [
      { to: '/warehouse', labelKey: 'nav.warehouse', icon: Package },
      { to: '/purchasing-recommendations', labelKey: 'nav.purchasingRecommendations', icon: ShoppingCart },
      { to: '/rentals', labelKey: 'nav.rentals', icon: PackageSearch },
      { to: '/fleet', labelKey: 'nav.fleet', icon: Car },
      { to: '/maintenance', labelKey: 'nav.maintenance', icon: CalendarClock },
      { to: '/reports', labelKey: 'nav.reports', icon: BarChart2 },
    ],
  },
  {
    key: 'team',
    labelKey: 'navGroups.team',
    icon: Users,
    items: [
      { to: '/users', labelKey: 'nav.users', icon: Users },
      { to: '/timekeeper', labelKey: 'nav.timekeeper', icon: CalendarClock },
      { to: '/permissions', labelKey: 'nav.permissions', icon: ShieldCheck },
      { to: '/groups', labelKey: 'nav.groups', icon: Users2 },
    ],
  },
  {
    key: 'system',
    labelKey: 'navGroups.system',
    icon: HardDrive,
    adminOnly: true,
    items: [
      { to: '/storage', labelKey: 'nav.storage', icon: HardDrive },
      { to: '/storage-routing', labelKey: 'nav.routing', icon: FileSliders },
      { to: '/templates', labelKey: 'nav.templates', icon: FileSliders },
      { to: '/template-designer', labelKey: 'nav.templateDesigner', icon: Palette },
      { to: '/files', labelKey: 'nav.fileLog', icon: FileStack },
      { to: '/devices', labelKey: 'nav.devices', icon: Smartphone },
      { to: '/calendar-sync', labelKey: 'nav.calendarSync', icon: CalendarDays },
      { to: '/audit-log', labelKey: 'nav.auditLog', icon: ScrollText },
      { to: '/backup', labelKey: 'nav.backup', icon: HardDriveDownload },
      { to: '/time-thresholds', labelKey: 'nav.timeThresholds', icon: Timer },
      { to: '/data-migration', labelKey: 'nav.dataMigration', icon: ArrowLeftRight },
      { to: '/tax-authority-export', labelKey: 'nav.taxAuthorityExport', icon: FileDown },
      { to: '/bank-data', labelKey: 'nav.bankData', icon: Landmark },
    ],
  },
];

/** Super-admin only — kept separate from NAV_GROUPS since it's added
 * conditionally based on user.organizationId, not a per-item
 * adminOnly flag the way the finance/system groups are. */
export const ORGANIZATIONS_GROUP: NavGroup = {
  key: 'organizations',
  labelKey: 'navGroups.organizations',
  icon: Building2,
  items: [{ to: '/organizations', labelKey: 'nav.organizations', icon: Building2 }],
};

export function visibleGroups(isSuperAdmin: boolean, isAdmin: boolean): NavGroup[] {
  const groups = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin).map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.adminOnly || isAdmin),
  }));
  return isSuperAdmin ? [ORGANIZATIONS_GROUP, ...groups] : groups;
}
