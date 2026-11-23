import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alltid i tid – Avgångar i realtid för tåg, buss & flyg',
  description: 'Kolla om ditt tåg, din buss eller ditt flyg är i tid. Realtidsinformation för hela Sverige.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <header style={{
          borderBottom: '1px solid #1e293b',
          padding: '16px 24px',
          backgroundColor: '#020617',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <a href="/" style={{
            color: '#38bdf8',
            fontWeight: 800,
            fontSize: '20px',
            textDecoration: 'none',
            letterSpacing: '-0.5px',
          }}>
            alltiditid.se
          </a>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Realtid i hela Sverige
          </span>
        </header>

        <main style={{ flex: 1, width: '100%', maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>
          {children}
        </main>

        <footer style={{
          borderTop: '1px solid #1e293b',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b',
          backgroundColor: '#020617',
        }}>
          <p style={{ margin: '0 0 6px 0' }}>
            Trafikdata från Trafiklab / Samtrafiken, Trafikverket och Swedavia.
          </p>
          <p style={{ margin: 0 }}>
            Sidan kan innehålla annonslänkar. &copy; {new Date().getFullYear()} alltiditid.se
          </p>
        </footer>
      </body>
    </html>
  );
}
