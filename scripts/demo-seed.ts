/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Demo Seed Script für Xynoxa
 *
 * Erstellt Beispieldaten für Demo-Zwecke
 */

import { db } from '../src/server/db';
import { users, notes, bookmarks, files, calendarEvents, tasks } from '../src/server/db/schema';
import { hash } from 'argon2';

async function seed() {
  console.warn('🌱 Starting demo seed...');

  try {
    // Demo User erstellen
    const demoEmail = 'demo@xynoxa.com';
    const demoPassword = 'Demo1234!';

    const hashedPassword = await hash(demoPassword);

    const [demoUser] = await db.insert(users).values({
      email: demoEmail,
      passwordHash: hashedPassword,
      role: 'member',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.warn(`✅ Demo user created: ${demoEmail} / ${demoPassword}`);

    // Demo Notes erstellen
    await db.insert(notes).values([
      {
        ownerId: demoUser.id,
        title: 'Willkommen bei Xynoxa!',
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Willkommen bei Xynoxa!' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Dies ist eine Demo-Note. Du kannst hier deine Gedanken festhalten, To-Dos verwalten oder einfach nur Notizen machen.' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Features' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich-Text Editor mit Markdown-Support' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tags für bessere Organisation' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Volltext-Suche' }] }] },
              ]
            }
          ]
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        ownerId: demoUser.id,
        title: 'Projekt-Planung',
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Projekt-Planung 2025' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hier plane ich meine Projekte für das neue Jahr.' }]
            }
          ]
        }),
        createdAt: new Date(Date.now() - 86400000), // 1 Tag alt
        updatedAt: new Date(Date.now() - 86400000),
      }
    ]);

    console.warn('✅ Demo notes created');

    // Demo Bookmarks erstellen
    await db.insert(bookmarks).values([
      {
        ownerId: demoUser.id,
        url: 'https://github.com/vercel/next.js',
        title: 'Next.js GitHub Repository',
        description: 'The React Framework for the Web',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        ownerId: demoUser.id,
        url: 'https://tailwindcss.com',
        title: 'Tailwind CSS',
        description: 'A utility-first CSS framework',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        ownerId: demoUser.id,
        url: 'https://www.typescriptlang.org',
        title: 'TypeScript',
        description: 'TypeScript is JavaScript with syntax for types',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ]);

    console.warn('✅ Demo bookmarks created');

    // Demo Calendar Events erstellen
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    await db.insert(calendarEvents).values([
      {
        ownerId: demoUser.id,
        title: 'Team Meeting',
        description: 'Wöchentliches Team-Sync',
        startsAt: tomorrow,
        endsAt: new Date(tomorrow.getTime() + 3600000), // +1 Stunde
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ]);

    console.warn('✅ Demo calendar events created');

    // Demo Tasks erstellen
    await db.insert(tasks).values([
      {
        ownerId: demoUser.id,
        title: 'Xynoxa erkunden',
        description: 'Alle Features von Xynoxa ausprobieren',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        ownerId: demoUser.id,
        title: 'Erste Note erstellen',
        description: 'Eine eigene Note schreiben',
        status: 'done',
        priority: 'high',
        createdAt: new Date(Date.now() - 3600000), // 1 Stunde alt
        updatedAt: new Date(),
      }
    ]);

    console.warn('✅ Demo tasks created');

    console.warn('\n🎉 Demo seed completed successfully!');
    console.warn('\n📧 Demo Login:');
    console.warn(`   Email: ${demoEmail}`);
    console.warn(`   Password: ${demoPassword}`);

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
