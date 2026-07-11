import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';
import { GoogleImportSession } from './entities/google-import-session.entity';
import { ParsedContact } from './phonebook.types';

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h — this is a one-shot "connect, browse, pick, done" flow, not a persistent connection

/**
 * One-off Google Contacts import: unlike Calendar's Google integration
 * (an ongoing sync with a stored refresh token), this doesn't keep any
 * Google credentials around after the import is done — a plain
 * access_token is enough to fetch the contact list once, and nothing
 * about this account needs to be remembered afterward.
 *
 * Reuses the same GOOGLE_CLIENT_ID/SECRET as Calendar's Google
 * integration, but needs its own redirect URI (GOOGLE_CONTACTS_REDIRECT_URI)
 * registered in Google Cloud Console for this callback path, and the
 * People API enabled on that project (separate from the Calendar API).
 */
@Injectable()
export class GoogleContactsService {
  private readonly logger = new Logger('GoogleContactsService');

  constructor(
    @InjectRepository(GoogleImportSession)
    private readonly sessionsRepo: Repository<GoogleImportSession>,
  ) {}

  private oauthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CONTACTS_REDIRECT_URI,
    );
  }

  /** `state` carries the requesting user's id through the redirect —
   * there's no JWT available once Google sends the browser back. */
  getAuthUrl(userId: number): string {
    const client = this.oauthClient();
    return client.generateAuthUrl({
      access_type: 'online', // one-shot fetch, no refresh token needed or stored
      scope: SCOPES,
      state: String(userId),
    });
  }

  /** Exchanges the code, fetches every contact from the People API, and
   * stashes the parsed list for the admin panel to pick up — see
   * GoogleImportSession's doc comment for why this indirection exists. */
  async handleCallback(code: string, userId: number): Promise<{ sessionId: number }> {
    let parsedContacts: ParsedContact[] = [];
    let error: string | undefined;

    try {
      const client = this.oauthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const people = google.people({ version: 'v1', auth: client });
      const all: any[] = [];
      let pageToken: string | undefined;
      do {
        const res = await people.people.connections.list({
          resourceName: 'people/me',
          pageSize: 1000,
          pageToken,
          personFields: 'names,phoneNumbers,emailAddresses,organizations,addresses',
        });
        all.push(...(res.data.connections ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);

      parsedContacts = all
        .map((person): ParsedContact | null => {
          const name = person.names?.[0];
          const firstName = name?.givenName || name?.displayName || '';
          const lastName = name?.familyName || '';
          if (!firstName && !lastName) return null;
          return {
            firstName: firstName || lastName,
            lastName: firstName ? lastName : '',
            phone: person.phoneNumbers?.[0]?.value ?? '',
            email: person.emailAddresses?.[0]?.value ?? undefined,
            organization: person.organizations?.[0]?.name ?? undefined,
            city: person.addresses?.[0]?.city ?? undefined,
          };
        })
        .filter((c): c is ParsedContact => c !== null);
    } catch (err: any) {
      this.logger.error(`Google Contacts import failed: ${err?.message}`);
      error = err?.message ?? 'Unknown error';
    }

    const session = await this.sessionsRepo.save(
      this.sessionsRepo.create({ user: { id: userId } as any, parsedContacts, error }),
    );
    return { sessionId: session.id };
  }

  /** One-time read — the admin panel calls this right after the OAuth
   * redirect lands back on the phone book page, then the row is gone. */
  async consumeSession(sessionId: number, userId: number): Promise<{ contacts: ParsedContact[]; error?: string }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId }, relations: ['user'] });
    if (!session || session.user.id !== userId) {
      return { contacts: [], error: 'Import session not found or expired' };
    }
    await this.sessionsRepo.remove(session);
    return { contacts: (session.parsedContacts as ParsedContact[]) ?? [], error: session.error };
  }

  /** Hourly sweep for anything abandoned mid-flow (browser closed right
   * after the Google redirect, before the page ever read it back). */
  @Cron('23 * * * *')
  async cleanupStale(): Promise<void> {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS);
    await this.sessionsRepo.createQueryBuilder().delete().where('"createdAt" < :cutoff', { cutoff }).execute();
  }
}
