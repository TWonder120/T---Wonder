import { pool } from './database.js';

// دالة لحساب الوقت المتبقي
function calculateRemainingTime(lastChangeTime) {
  const now = new Date();
  const lastChange = new Date(lastChangeTime);
  const timeSinceLastChange = now - lastChange;
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

  if (timeSinceLastChange >= threeDaysInMs) {
    return null; // يمكن التغيير
  }

  const remainingTime = threeDaysInMs - timeSinceLastChange;
  const remainingDays = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor(
    (remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const remainingMinutes = Math.floor(
    (remainingTime % (1000 * 60 * 60)) / (1000 * 60)
  );
  const remainingSeconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

  return {
    days: remainingDays,
    hours: remainingHours,
    minutes: remainingMinutes,
    seconds: remainingSeconds,
  };
}

// إنشاء حساب جديد
export async function createAccount(guildId, userId, username, userHandle, avatarUrl) {
  console.log(
    `إنشاء حساب جديد للمستخدم ${userId} في السيرفر ${guildId}: ${username} (@${userHandle})`
  );

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO accounts (guild_id, user_id, username, user_handle, avatar_url, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (guild_id, user_id) 
       DO UPDATE SET username = $3, user_handle = $4, avatar_url = $5
       RETURNING *`,
      [guildId, userId, username, userHandle, avatarUrl]
    );

    console.log(`تم إنشاء الحساب بنجاح للمستخدم ${userId} في السيرفر ${guildId}`);
    return result.rows[0];
  } catch (error) {
    console.error('خطأ في إنشاء الحساب:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// الحصول على حساب المستخدم
export async function getAccount(guildId, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM accounts WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('خطأ في الحصول على الحساب:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// تحديث صورة الحساب
export async function updateAvatar(guildId, userId, avatarUrl) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE accounts SET avatar_url = $1 WHERE guild_id = $2 AND user_id = $3 RETURNING *',
      [avatarUrl, guildId, userId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('خطأ في تحديث الصورة:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// تحديث اسم المستخدم
export async function updateUsername(guildId, userId, username) {
  const client = await pool.connect();
  try {
    // التحقق من الوقت المتبقي
    const account = await getAccount(guildId, userId);
    if (!account) {
      return { success: false, message: "الحساب غير موجود" };
    }

    if (account.last_username_change) {
      const remainingTime = calculateRemainingTime(account.last_username_change);
      if (remainingTime) {
        return {
          success: false,
          message: `يمكنك تغيير اسم المستخدم مرة واحدة كل 3 أيام\nالوقت المتبقي: ${remainingTime.days} يوم، ${remainingTime.hours} ساعة، ${remainingTime.minutes} دقيقة، ${remainingTime.seconds} ثانية`,
        };
      }
    }

    const result = await client.query(
      'UPDATE accounts SET username = $1, last_username_change = CURRENT_TIMESTAMP WHERE guild_id = $2 AND user_id = $3 RETURNING *',
      [username, guildId, userId]
    );

    return { success: true };
  } catch (error) {
    console.error('خطأ في تحديث اسم المستخدم:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// تحديث اليوزر
export async function updateHandle(guildId, userId, userHandle) {
  const client = await pool.connect();
  try {
    // التحقق من الوقت المتبقي
    const account = await getAccount(guildId, userId);
    if (!account) {
      return { success: false, message: "الحساب غير موجود" };
    }

    if (account.last_handle_change) {
      const remainingTime = calculateRemainingTime(account.last_handle_change);
      if (remainingTime) {
        return {
          success: false,
          message: `يمكنك تغيير اليوزر مرة واحدة كل 3 أيام\nالوقت المتبقي: ${remainingTime.days} يوم، ${remainingTime.hours} ساعة، ${remainingTime.minutes} دقيقة، ${remainingTime.seconds} ثانية`,
        };
      }
    }

    const result = await client.query(
      'UPDATE accounts SET user_handle = $1, last_handle_change = CURRENT_TIMESTAMP WHERE guild_id = $2 AND user_id = $3 RETURNING *',
      [userHandle, guildId, userId]
    );

    return { success: true };
  } catch (error) {
    console.error('خطأ في تحديث اليوزر:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// التحقق من وجود الحساب
export async function hasAccount(guildId, userId) {
  const account = await getAccount(guildId, userId);
  return !!account;
}

// فحص الوقت المتبقي لتغيير اسم المستخدم
export async function checkUsernameChangeTime(guildId, userId) {
  const account = await getAccount(guildId, userId);
  if (!account) {
    return { canChange: false, message: "الحساب غير موجود" };
  }

  if (!account.last_username_change) {
    return { canChange: true, message: "يمكنك تغيير اسم المستخدم الآن" };
  }

  const remainingTime = calculateRemainingTime(account.last_username_change);
  if (remainingTime) {
    return {
      canChange: false,
      message: `يمكنك تغيير اسم المستخدم مرة واحدة كل 3 أيام\nالوقت المتبقي: ${remainingTime.days} يوم، ${remainingTime.hours} ساعة، ${remainingTime.minutes} دقيقة، ${remainingTime.seconds} ثانية`,
    };
  }

  return { canChange: true, message: "يمكنك تغيير اسم المستخدم الآن" };
}

// فحص الوقت المتبقي لتغيير اليوزر
export async function checkHandleChangeTime(guildId, userId) {
  const account = await getAccount(guildId, userId);
  if (!account) {
    return { canChange: false, message: "الحساب غير موجود" };
  }

  if (!account.last_handle_change) {
    return { canChange: true, message: "يمكنك تغيير اليوزر الآن" };
  }

  const remainingTime = calculateRemainingTime(account.last_handle_change);
  if (remainingTime) {
    return {
      canChange: false,
      message: `يمكنك تغيير اليوزر مرة واحدة كل 3 أيام\nالوقت المتبقي: ${remainingTime.days} يوم، ${remainingTime.hours} ساعة، ${remainingTime.minutes} دقيقة، ${remainingTime.seconds} ثانية`,
    };
  }

  return { canChange: true, message: "يمكنك تغيير اليوزر الآن" };
}

// دوال إضافية لإدارة التغريدات
export async function createTweet(guildId, userId, content, imageUrl = null) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO tweets (guild_id, user_id, content, image_url, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [guildId, userId, content, imageUrl]
    );
    return result.rows[0];
  } catch (error) {
    console.error('خطأ في إنشاء التغريدة:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function getTweets(guildId, limit = 10, offset = 0) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT t.*, a.username, a.user_handle, a.avatar_url
       FROM tweets t
       JOIN accounts a ON t.guild_id = a.guild_id AND t.user_id = a.user_id
       WHERE t.guild_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [guildId, limit, offset]
    );
    return result.rows;
  } catch (error) {
    console.error('خطأ في الحصول على التغريدات:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function likeTweet(tweetId, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO likes (tweet_id, user_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (tweet_id, user_id) DO NOTHING
       RETURNING *`,
      [tweetId, userId]
    );

    // تحديث عدد الإعجابات
    await client.query(
      'UPDATE tweets SET likes_count = (SELECT COUNT(*) FROM likes WHERE tweet_id = $1) WHERE id = $1',
      [tweetId]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('خطأ في الإعجاب بالتغريدة:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function retweet(tweetId, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO retweets (tweet_id, user_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (tweet_id, user_id) DO NOTHING
       RETURNING *`,
      [tweetId, userId]
    );

    // تحديث عدد إعادة التغريد
    await client.query(
      'UPDATE tweets SET retweets_count = (SELECT COUNT(*) FROM retweets WHERE tweet_id = $1) WHERE id = $1',
      [tweetId]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('خطأ في إعادة التغريد:', error.message);
    throw error;
  } finally {
    client.release();
  }
}
