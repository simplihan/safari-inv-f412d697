import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

const STATUS: Record<Reason, 'bounced' | 'complained' | 'suppressed'> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

const MESSAGE: Record<Reason, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

function serviceClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Server configuration error')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Records the delivery outcome in the app's own notification tables. These rows
// are informational only — Lovable enforces suppression at send time.
async function record(
  reason: Reason,
  event: { event_id: string; data: { recipient: string; message_id?: string } }
) {
  const sb = serviceClient()
  const email = event.data.recipient.toLowerCase()

  const { error: suppressError } = await sb
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('Failed to record suppression', {
      event_id: event.event_id,
      code: suppressError.code,
      message: suppressError.message,
    })
    throw new Error('Failed to record suppression')
  }

  const { error: logError } = await sb.from('email_send_log').insert({
    message_id: event.data.message_id ?? null,
    template_name: 'system',
    recipient_email: email,
    status: STATUS[reason],
    error_message: MESSAGE[reason],
    metadata: null,
  })
  if (logError) {
    console.error('Failed to record delivery event', {
      event_id: event.event_id,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('Failed to record delivery event')
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await record('bounce', event)
            },
            'email.complaint': async (event) => {
              await record('complaint', event)
            },
            'email.unsubscribed': async (event) => {
              await record('unsubscribe', event)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
