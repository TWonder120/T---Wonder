import { testConnection, createTables, closeConnection } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// دالة لنقل البيانات من JSON إلى PostgreSQL
async function migrateData() {
  const accountsPath = path.join(__dirname, 'accounts.json');
  
  if (!fs.existsSync(accountsPath)) {
    console.log('⚠️ ملف accounts.json غير موجود، لن يتم نقل أي بيانات');
    return;
  }

  try {
    const accountsData = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
    const { pool } = await import('./database.js');
    const client = await pool.connect();

    console.log('🔄 بدء نقل البيانات من JSON إلى PostgreSQL...');

    let migratedCount = 0;
    for (const [guildId, guildAccounts] of Object.entries(accountsData)) {
      for (const [userId, accountData] of Object.entries(guildAccounts)) {
        try {
          await client.query(
            `INSERT INTO accounts (guild_id, user_id, username, user_handle, avatar_url, created_at, last_username_change, last_handle_change)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (guild_id, user_id) DO NOTHING`,
            [
              guildId,
              userId,
              accountData.username,
              accountData.userHandle,
              accountData.avatarUrl,
              accountData.createdAt || new Date().toISOString(),
              accountData.lastUsernameChange || null,
              accountData.lastHandleChange || null
            ]
          );
          migratedCount++;
        } catch (error) {
          console.error(`خطأ في نقل حساب ${userId} من السيرفر ${guildId}:`, error.message);
        }
      }
    }

    console.log(`✅ تم نقل ${migratedCount} حساب بنجاح`);
    client.release();
  } catch (error) {
    console.error('❌ خطأ في نقل البيانات:', error.message);
    throw error;
  }
}

// الدالة الرئيسية
async function main() {
  console.log('🚀 بدء إعداد قاعدة البيانات...');

  try {
    // اختبار الاتصال
    const connected = await testConnection();
    if (!connected) {
      console.log('❌ فشل الاتصال بقاعدة البيانات. تأكد من إعداد متغير DATABASE_URL');
      process.exit(1);
    }

    // إنشاء الجداول
    await createTables();

    // نقل البيانات
    await migrateData();

    console.log('✅ تم إعداد قاعدة البيانات بنجاح!');
    console.log('📝 الخطوات التالية:');
    console.log('1. تأكد من إعداد متغير DATABASE_URL في ملف .env');
    console.log('2. قم بتحديث index.js لاستخدام dbAccountManager.js بدلاً من accountManager.js');
    console.log('3. اختبر البوت للتأكد من عمل قاعدة البيانات');

  } catch (error) {
    console.error('❌ خطأ في إعداد قاعدة البيانات:', error.message);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

// تشغيل السكريبت
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
