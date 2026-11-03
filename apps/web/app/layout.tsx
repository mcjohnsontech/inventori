import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Dayari Inventory', description: 'Shop catalogue and supplier provenance' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
