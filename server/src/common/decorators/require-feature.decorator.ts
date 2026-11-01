import { SetMetadata } from '@nestjs/common';

export const REQUIRED_FEATURES_KEY = 'requiredFeatures';

/** Requires the caller to hold ALL the listed feature permissions (see
 * modules/users/permissions.constants.ts). Class-level and method-level
 * requirements add up. Needs FeatureGuard in @UseGuards. */
export const RequireFeature = (...keys: string[]) => SetMetadata(REQUIRED_FEATURES_KEY, keys);
