import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Row { name: string; sessions: number; minutes: number }
interface Props {
  siteName?: string
  department?: string
  monthLabel?: string
  totalSessions?: number
  totalMinutes?: number
  topStaff?: Row[]
}

const MonthlyReport = ({
  siteName = 'Pulse Safari',
  department = 'your department',
  monthLabel = 'last month',
  totalSessions = 0,
  totalMinutes = 0,
  topStaff = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{department} — {monthLabel} activity summary</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{department} — {monthLabel}</Heading>
        <Text style={text}>
          Here's your {siteName} monthly activity summary.
        </Text>
        <Section style={card}>
          <Text style={stat}><b>{totalSessions}</b> total sessions</Text>
          <Text style={stat}><b>{Math.round(totalMinutes)}</b> minutes out</Text>
        </Section>
        {topStaff.length > 0 && (
          <Section>
            <Heading as="h2" style={h2}>Top staff</Heading>
            {topStaff.map((r, i) => (
              <Text key={i} style={row}>
                {i + 1}. {r.name} — {r.sessions} sessions · {Math.round(r.minutes)} min
              </Text>
            ))}
          </Section>
        )}
        <Text style={footer}>
          You're receiving this because monthly reports are enabled for {department}.
          Toggle this off in the Departments page if you no longer want it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MonthlyReport

export const template = {
  component: MonthlyReport,
  subject: (data: Record<string, any>) =>
    `${data.department ?? 'Department'} — ${data.monthLabel ?? 'monthly'} activity report`,
  displayName: 'Monthly department report',
  previewData: {
    siteName: 'Pulse Safari',
    department: 'Operations',
    monthLabel: 'May 2026',
    totalSessions: 42,
    totalMinutes: 318,
    topStaff: [
      { name: 'Alex Kim', sessions: 12, minutes: 95 },
      { name: 'Priya Shah', sessions: 9, minutes: 71 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 12px' }
const h2 = { fontSize: '16px', fontWeight: 'bold' as const, color: '#0f172a', margin: '20px 0 8px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', margin: '12px 0 20px' }
const stat = { fontSize: '15px', color: '#0f172a', margin: '4px 0' }
const row = { fontSize: '13px', color: '#475569', margin: '4px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', marginTop: '24px' }