/**
 * Email Tracking Service
  * Provides tracking pixel generation and open event recording.
   *
    * How it works:
     *  1. When an email is sent, embed a 1x1 transparent GIF URL:
      *     <img src="https://your-app.com/api/track/open?t=<trackingToken>" width="1" height="1" style="display:none" />
       *  2. When the recipient opens the email, their email client fetches the pixel.
        *  3. Our /api/track/open endpoint records the open event and returns the GIF.
         *
          * Usage in email-sender.ts:
           *   import { generateTrackingPixel, embedTrackingPixel } from './email-tracker';
            *   const { token, pixelHtml } = generateTrackingPixel(emailSequenceId, userId);
             *   const bodyWithTracking = embedTrackingPixel(emailBody, token);
              */

              import { nanoid } from 'nanoid';
              import { getDb } from '../db';

              // ─── Token helpers ────────────────────────────────────────────
              /** Encode { emailId, userId } into a URL-safe token */
              export function encodeTrackingToken(emailId: number, userId: number): string {
                const payload = JSON.stringify({ e: emailId, u: userId, ts: Date.now() });
                  return Buffer.from(payload).toString('base64url');
                  }

                  /** Decode tracking token back to { emailId, userId } */
                  export function decodeTrackingToken(token: string): { emailId: number; userId: number; ts: number } | null {
                    try {
                        const payload = Buffer.from(token, 'base64url').toString('utf-8');
                            const obj = JSON.parse(payload);
                                if (typeof obj.e !== 'number' || typeof obj.u !== 'number') return null;
                                    return { emailId: obj.e, userId: obj.u, ts: obj.ts ?? 0 };
                                      } catch {
                                          return null;
                                            }
                                            }

                                            // ─── Pixel generation ────────────────────────────────────────
                                            /**
                                             * Generate a tracking pixel HTML snippet for embedding in email body.
                                              * @param emailId  - The emailSequence ID
                                               * @param userId   - The owner user ID
                                                * @returns { token, pixelHtml } - token for storage, pixelHtml to append to email body
                                                 */
                                                 export function generateTrackingPixel(
                                                   emailId: number,
                                                     userId: number,
                                                     ): { token: string; pixelHtml: string } {
                                                       const token = encodeTrackingToken(emailId, userId);
                                                         const baseUrl = process.env.APP_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000';
                                                           const pixelUrl = `${baseUrl}/api/track/open?t=${token}`;
                                                             const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
                                                               return { token, pixelHtml };
                                                               }

                                                               /**
                                                                * Append the tracking pixel to an HTML email body.
                                                                 * If the body contains </body>, inserts before it; otherwise appends at end.
                                                                  */
                                                                  export function embedTrackingPixel(htmlBody: string, token: string): string {
                                                                    const baseUrl = process.env.APP_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000';
                                                                      const pixelUrl = `${baseUrl}/api/track/open?t=${token}`;
                                                                        const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
                                                                          if (htmlBody.includes('</body>')) {
                                                                              return htmlBody.replace('</body>', `${pixelHtml}</body>`);
                                                                                }
                                                                                  return htmlBody + pixelHtml;
                                                                                  }

                                                                                  // ─── 1x1 transparent GIF bytes ───────────────────────────────
                                                                                  export const TRANSPARENT_GIF = Buffer.from(
                                                                                    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                                                                                      'base64',
                                                                                      );

                                                                                      // ─── Open event recording ────────────────────────────────────
                                                                                      /**
                                                                                       * Record an email open event in the database.
                                                                                        * Called by the /api/track/open HTTP handler.
                                                                                         *
                                                                                          * @param token - The base64url tracking token from the query string
                                                                                           * @returns true if recorded successfully, false if invalid token or already recorded
                                                                                            */
                                                                                            export async function recordEmailOpen(token: string): Promise<boolean> {
                                                                                              const decoded = decodeTrackingToken(token);
                                                                                                if (!decoded) return false;

                                                                                                  const db = await getDb();
                                                                                                    if (!db) return false;
                                                                                                    
                                                                                                      try {
                                                                                                          const { emailSequences } = await import('../../drizzle/schema');
                                                                                                              const { eq } = await import('drizzle-orm');
                                                                                                              
                                                                                                                  // Fetch current email record
                                                                                                                      const rows = await db
                                                                                                                            .select({ id: emailSequences.id, openedAt: emailSequences.openedAt })
                                                                                                                                  .from(emailSequences)
                                                                                                                                        .where(eq(emailSequences.id, decoded.emailId))
                                                                                                                                              .limit(1);
                                                                                                                                              
                                                                                                                                                  if (rows.length === 0) return false;
                                                                                                                                                  
                                                                                                                                                      // Only record the first open
                                                                                                                                                          if (rows[0].openedAt) {
                                                                                                                                                                // Already opened – update open count if column exists, but don't re-notify
                                                                                                                                                                      await db
                                                                                                                                                                              .update(emailSequences)
                                                                                                                                                                                      .set({ openCount: (rows[0] as any).openCount ? (rows[0] as any).openCount + 1 : 2 })
                                                                                                                                                                                              .where(eq(emailSequences.id, decoded.emailId))
                                                                                                                                                                                                      .catch(() => {}); // ignore if column doesn't exist yet
                                                                                                                                                                                                            return false;
                                                                                                                                                                                                                }
                                                                                                                                                                                                                
                                                                                                                                                                                                                    // First open: set openedAt timestamp & update status
                                                                                                                                                                                                                        await db
                                                                                                                                                                                                                              .update(emailSequences)
                                                                                                                                                                                                                                    .set({
                                                                                                                                                                                                                                            openedAt: new Date(),
                                                                                                                                                                                                                                                    openCount: 1,
                                                                                                                                                                                                                                                            status: 'opened',
                                                                                                                                                                                                                                                                  } as any)
                                                                                                                                                                                                                                                                        .where(eq(emailSequences.id, decoded.emailId));
                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                            // Create a notification for the user
                                                                                                                                                                                                                                                                                const { notifications } = await import('../../drizzle/schema');
                                                                                                                                                                                                                                                                                    const { leads: leadsTable } = await import('../../drizzle/schema');
                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                        // Get lead info for notification
                                                                                                                                                                                                                                                                                            const emailRow = await db
                                                                                                                                                                                                                                                                                                  .select({ leadId: emailSequences.leadId, subject: emailSequences.subject })
                                                                                                                                                                                                                                                                                                        .from(emailSequences)
                                                                                                                                                                                                                                                                                                              .where(eq(emailSequences.id, decoded.emailId))
                                                                                                                                                                                                                                                                                                                    .limit(1);
                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                        if (emailRow.length > 0) {
                                                                                                                                                                                                                                                                                                                              const leadRows = await db
                                                                                                                                                                                                                                                                                                                                      .select({ email: leadsTable.email, companyName: leadsTable.companyName })
                                                                                                                                                                                                                                                                                                                                              .from(leadsTable)
                                                                                                                                                                                                                                                                                                                                                      .where(eq(leadsTable.id, emailRow[0].leadId))
                                                                                                                                                                                                                                                                                                                                                              .limit(1);
                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                                                                                    const leadEmail = leadRows[0]?.email ?? 'unknown';
                                                                                                                                                                                                                                                                                                                                                                          const company = leadRows[0]?.companyName ?? leadEmail;
                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                await db.insert(notifications).values({
                                                                                                                                                                                                                                                                                                                                                                                        userId: decoded.userId,
                                                                                                                                                                                                                                                                                                                                                                                                leadId: emailRow[0].leadId,
                                                                                                                                                                                                                                                                                                                                                                                                        type: 'email_opened',
                                                                                                                                                                                                                                                                                                                                                                                                                title: `邮件已被打开：${company}`,
                                                                                                                                                                                                                                                                                                                                                                                                                        message: `${company} 打开了您发送的邮件「${emailRow[0].subject ?? '(无主题)'}」，建议适时跟进。`,
                                                                                                                                                                                                                                                                                                                                                                                                                                actionUrl: `/leads/${emailRow[0].leadId}`,
                                                                                                                                                                                                                                                                                                                                                                                                                                        isRead: false,
                                                                                                                                                                                                                                                                                                                                                                                                                                              } as any);
                                                                                                                                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                                                      console.log(`[Tracker] Email ${decoded.emailId} opened by user ${decoded.userId}`);
                                                                                                                                                                                                                                                                                                                                                                                                                                                          return true;
                                                                                                                                                                                                                                                                                                                                                                                                                                                            } catch (err) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                console.error('[Tracker] Failed to record open:', err);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return false;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      }
