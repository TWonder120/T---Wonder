import pkg from 'pg';
const { Pool } = pkg;

// إعدادات قاعدة البيانات
const dbConfig = {
  connectionString: process.env.DATABASE_URL, // ستحتاج لإضافة هذا المتغير في ملف .env
  ssl: {
    rejectUnauthorized: false // مطلوب لـ Neon
  }
};

// إنشاء اتصال قاعدة البيانات
const pool = new Pool(dbConfig);

// اختبار الاتصال
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
    return false;
  }
}

// إنشاء الجداول المطلوبة
export async function createTables() {
  const client = await pool.connect();
  try {
    // جدول الحسابات
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        user_handle VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_username_change TIMESTAMP,
        last_handle_change TIMESTAMP,
        UNIQUE(guild_id, user_id)
      )
    `);

    // جدول التغريدات
    await client.query(`
      CREATE TABLE IF NOT EXISTS tweets (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        likes_count INTEGER DEFAULT 0,
        retweets_count INTEGER DEFAULT 0,
        replies_count INTEGER DEFAULT 0
      )
    `);

    // جدول الإعجابات
    await client.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        tweet_id INTEGER REFERENCES tweets(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tweet_id, user_id)
      )
    `);

    // جدول إعادة التغريد
    await client.query(`
      CREATE TABLE IF NOT EXISTS retweets (
        id SERIAL PRIMARY KEY,
        tweet_id INTEGER REFERENCES tweets(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tweet_id, user_id)
      )
    `);

    // جدول الردود
    await client.query(`
      CREATE TABLE IF NOT EXISTS replies (
        id SERIAL PRIMARY KEY,
        tweet_id INTEGER REFERENCES tweets(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ تم إنشاء الجداول بنجاح');
  } catch (error) {
    console.error('❌ خطأ في إنشاء الجداول:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// إغلاق الاتصال
export async function closeConnection() {
  await pool.end();
}

export { pool };
