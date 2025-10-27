# دليل النشر على GitHub و Render

## 📋 الخطوات المطلوبة:

### 1. إعداد Git والرفع على GitHub

```bash
# تهيئة Git
git init

# إضافة جميع الملفات
git add .

# عمل Commit أولي
git commit -m "Initial commit: Wonder Twitter Bot"

# إضافة Remote (استبدل username/repo-name)
git remote add origin https://github.com/username/wonder-twitter-bot.git

# رفع المشروع
git push -u origin main
```

### 2. إعداد Render

1. **اذهب إلى [Render Dashboard](https://dashboard.render.com/)**
2. **اضغط "New +" ثم "Web Service"**
3. **اربط حساب GitHub واختر المشروع**
4. **املأ الإعدادات:**

   **Name:** `wonder-twitter-bot`
   
   **Environment:** `Node`
   
   **Build Command:** `npm install`
   
   **Start Command:** `npm start`

5. **أضف متغيرات البيئة:**
   ```
   DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
   BOT_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   OWNER_GUILD_ID=your_owner_guild_id_here
   DEVELOPER_ID=your_developer_id_here
   ```

6. **اضغط "Create Web Service"**

### 3. إعداد قاعدة البيانات

بعد نشر البوت على Render:

1. **اذهب إلى لوحة تحكم Neon**
2. **احصل على رابط الاتصال**
3. **أضف الرابط في متغيرات البيئة في Render:**
   - Settings > Environment > Add Environment Variable
   - Key: `DATABASE_URL`
   - Value: رابط الاتصال من Neon

### 4. تشغيل إعداد قاعدة البيانات

بعد إضافة DATABASE_URL، شغّل هذا الأمر في Render Console:

```bash
npm run setup-db
```

أو أضف هذا الأمر في Build Command:
```bash
npm install && npm run setup-db
```

## ⚠️ ملاحظات مهمة:

1. **لا ترفع ملف `config.json`** - تم إضافته إلى `.gitignore`
2. **استخدم متغيرات البيئة** في Render بدلاً من الملفات المحلية
3. **احفظ التوكنات بأمان** - لا تشاركها مع أي شخص
4. **راقب استخدام قاعدة البيانات** - الخطة المجانية لها حدود

## 🔧 استكشاف الأخطاء:

### خطأ في الاتصال بقاعدة البيانات:
- تأكد من صحة `DATABASE_URL`
- تأكد من تشغيل `npm run setup-db`

### خطأ في التوكن:
- تأكد من صحة `BOT_TOKEN`
- تأكد من صحة `CLIENT_ID`

### خطأ في الصلاحيات:
- تأكد من صحة `OWNER_GUILD_ID` و `DEVELOPER_ID`

## 📞 الدعم:

إذا واجهت مشاكل:
1. راجع ملفات السجل في Render
2. تحقق من متغيرات البيئة
3. تأكد من إعداد قاعدة البيانات
4. افتح Issue في GitHub

---

**تم الإعداد بنجاح! 🎉**
